#!/bin/zsh
cd "$(dirname "$0")" || exit 1
/usr/bin/python3 serve.py --launch
if [[ $? -ne 0 ]]; then
  printf '\nPress Return to close...'
  read
fi
