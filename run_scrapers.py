"""
Run all OICC scrapers in one go.
Open this file in VS Code and click the ▶ Run button (top-right).
"""

import subprocess
import sys
from pathlib import Path

SCRAPER_DIR = Path(__file__).parent / 'scraper'


def run(label, args):
    print(f'\n{"=" * 50}')
    print(f'  {label}')
    print(f'{"=" * 50}')
    result = subprocess.run(
        [sys.executable] + args,
        cwd=SCRAPER_DIR,
    )
    if result.returncode != 0:
        print(f'\n[!] {label} finished with errors (exit code {result.returncode})')
    else:
        print(f'\n[✓] {label} completed successfully')


run('PlayCricket scraper', ['oicc_playcricket.py', '--multi-season'])
run('Achton Villa scraper', ['achton_villa_scraper.py'])

print('\nAll scrapers finished.')
