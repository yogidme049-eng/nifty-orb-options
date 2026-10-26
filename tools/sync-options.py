"""Incremental offline snapshot builder. Requires duckdb for import only.
Usage: python sync-options.py /path/to/OC_Data/nifty
"""
import sys,json,gzip,datetime,hashlib
from pathlib import Path
import duckdb
src=Path(sys.argv[1]);out=Path(__file__).resolve().parents[1]/'site/options-data';out.mkdir(exist_ok=True)
manifest=json.loads((out/'manifest.json').read_text()) if (out/'manifest.json').exists() else {'format':1,'source':'OC_Data/nifty','columns':['minuteIST','expiryYYYYMMDD','strike','callLTP','putLTP','spot'],'files':[],'days':{}}
manifest['conflictPolicy']='One source per day: Parquet takes precedence over CSV. Within-source conflicting prices are excluded; zeros and blanks are unavailable.'
c=duckdb.connect();c.execute('SET threads=4')
for f in sorted(src.glob('*.parquet'))+sorted(src.glob('*.csv')):
 previous=next((x for x in manifest['files'] if x['name']==f.name),None)
 if previous and previous['bytes']==f.stat().st_size and previous.get('mtime_ns',f.stat().st_mtime_ns)==f.stat().st_mtime_ns and all((out/(d+'.json.gz')).exists() for d,v in manifest['days'].items() if v['source']==f.name):
  print('Reuse',f.name,flush=True);continue
 print('Import',f.name,flush=True)
 if f.suffix=='.parquet':
  c.execute("CREATE OR REPLACE TABLE batch AS SELECT pulled_date AS d,substr(pulled_time,1,5) AS t,expiry AS e,strike_price AS k,call_ltp AS ce,put_ltp AS pe,spot_price AS s FROM read_parquet(?) WHERE upper(underlying) IN ('NIFTY','NIFTY 50','NIFTY50')",[str(f)])
 else:
  c.execute("CREATE OR REPLACE TABLE raw_csv AS SELECT * FROM read_csv(?,header=true,all_varchar=true)",[str(f)])
  columns={r[0] for r in c.execute('DESCRIBE raw_csv').fetchall()}
  call='callPremium' if 'callPremium' in columns else 'call_price'
  put='putPremium' if 'putPremium' in columns else 'put_price'
  spot='try_cast(spot AS DOUBLE)' if 'spot' in columns else '0.0'
  underlying=" WHERE lower(trim(\"index\")) IN ('nifty','nifty50','nifty 50')" if 'index' in columns else ''
  c.execute(f"CREATE OR REPLACE TABLE batch AS SELECT date AS d,time AS t,coalesce(strftime(try_strptime(expiry,'%d %b %Y'),'%Y-%m-%d'),strftime(try_strptime(expiry,'%Y-%m-%d'),'%Y-%m-%d')) AS e,try_cast(strike AS DOUBLE) AS k,try_cast({call} AS DOUBLE) AS ce,try_cast({put} AS DOUBLE) AS pe,{spot} AS s FROM raw_csv"+underlying)
 count=c.execute('select count(*) from batch').fetchone()[0]
 c.execute("""CREATE OR REPLACE TABLE normalized AS SELECT *,try_cast(substr(t,1,2) AS INT)*60+try_cast(substr(t,4,2) AS INT) AS m,try_cast(replace(e,'-','') AS BIGINT) AS ex FROM batch WHERE d BETWEEN '2021-01-01' AND '2026-09-30'""")
 c.execute("""CREATE OR REPLACE TABLE clean AS SELECT d,m,ex,k,
 CASE WHEN count(distinct ce) FILTER (WHERE ce>0 AND isfinite(ce))>1 THEN -1 ELSE coalesce(max(ce) FILTER (WHERE ce>0 AND isfinite(ce)),0) END AS ce,
 CASE WHEN count(distinct pe) FILTER (WHERE pe>0 AND isfinite(pe))>1 THEN -1 ELSE coalesce(max(pe) FILTER (WHERE pe>0 AND isfinite(pe)),0) END AS pe,
 CASE WHEN count(distinct s) FILTER (WHERE s>0 AND isfinite(s))>1 THEN -1 ELSE coalesce(max(s) FILTER (WHERE s>0 AND isfinite(s)),0) END AS spot
 FROM normalized WHERE m BETWEEN 555 AND 930 AND e>=d AND k>0 AND isfinite(k) AND ex IS NOT NULL GROUP BY d,m,ex,k""")
 rows=c.execute("SELECT d,to_json(list(json_array(m,ex,k,ce,pe,spot) ORDER BY m,ex,k)),count(*),sum(cast(ce>0 AS INT)+cast(pe>0 AS INT)),sum(cast(ce=-1 AS INT)+cast(pe=-1 AS INT)+cast(spot=-1 AS INT)) FROM clean GROUP BY d ORDER BY d").fetchall()
 for d,raw,n,quotes,conflicts in rows:
  old=manifest['days'].get(d)
  if f.suffix=='.csv' and old and old['source'].endswith('.parquet'):continue
  packed=gzip.compress(raw.encode(),compresslevel=3,mtime=0);dest=out/(d+'.json.gz');dest.write_bytes(packed)
  invalid=c.execute('SELECT count(*) FROM normalized WHERE d=? AND NOT coalesce(m BETWEEN 555 AND 930 AND e>=d AND k>0 AND isfinite(k) AND ex IS NOT NULL,false)',[d]).fetchone()[0]
  manifest['days'][d]={'source':f.name,'rows':n,'quotes':quotes,'bytes':len(packed),'hash':hashlib.sha256(packed).hexdigest()[:16],'conflicts':conflicts,'invalidRows':invalid}
 manifest['files']=[x for x in manifest['files'] if x['name']!=f.name]+[{'name':f.name,'bytes':f.stat().st_size,'rows':count,'mtime_ns':f.stat().st_mtime_ns}]
 manifest['days']=dict(sorted(manifest['days'].items()));manifest['quoteCount']=sum(x['quotes'] for x in manifest['days'].values());manifest['totalBytes']=sum(x['bytes'] for x in manifest['days'].values());manifest['syncedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat()
 (out/'manifest.json').write_text(json.dumps(manifest,separators=(',',':')))
 print('Done',f.name,len(rows),'days; total',len(manifest['days']),flush=True)
print('COMPLETE',len(manifest['days']),manifest['quoteCount'],manifest['totalBytes'],flush=True)
