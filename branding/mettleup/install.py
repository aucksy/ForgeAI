"""
Copy the MettleUp brand files into the apps. DRY RUN by default: prints what it would change.

    python branding/mettleup/install.py                    # show the plan, change nothing
    python branding/mettleup/install.py --apply            # do it
    python branding/mettleup/install.py --apply --only mobile      # mobile | wear | dashboard
    python branding/mettleup/install.py --apply --force    # also overwrite files with uncommitted edits

It never deletes anything. A target file that has uncommitted changes in git (someone else is
editing it) is skipped unless --force. Config edits (app.json, colors.xml, manifest) are small
in-place text replacements, each checked afterwards; if a check fails, that file is left alone.
"""
import argparse
import filecmp
import json
import os
import re
import shutil
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
MOB = 'apps/mobile'
RES = f'{MOB}/android/app/src/main/res'
DENS = ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi']

STEEL, FORGE = '#1B1F26', '#F0662A'
SPLASH_IMAGE_WIDTH = 150   # dp; the hex is then ~146 dp tall inside Android 12's 192 dp circle


def copies():
    c = {'mobile': [], 'wear': [], 'dashboard': []}
    m = c['mobile']
    for d in DENS:
        for f in ('ic_launcher_foreground.png', 'ic_launcher_background.png', 'ic_launcher_monochrome.png',
                  'ic_launcher.png', 'ic_launcher_round.png'):
            m.append((f'android/res/mipmap-{d}/{f}', f'{RES}/mipmap-{d}/{f}'))
        m.append((f'android/res/drawable-{d}/splashscreen_logo.png', f'{RES}/drawable-{d}/splashscreen_logo.png'))
    for f in ('ic_launcher.xml', 'ic_launcher_round.xml'):
        m.append((f'android/res/mipmap-anydpi-v26/{f}', f'{RES}/mipmap-anydpi-v26/{f}'))
    m.append(('android/res/drawable/notification_icon.xml', f'{RES}/drawable/notification_icon.xml'))
    for f in ('icon.png', 'android-icon-foreground.png', 'android-icon-background.png',
              'android-icon-monochrome.png', 'splash-icon.png', 'favicon.png', 'notification-icon.png'):
        m.append((f'android/expo/{f}', f'{MOB}/assets/images/{f}'))
    for f in ('ic_launcher.xml', 'ic_stat_forge.xml'):
        c['wear'].append((f'android/wear/res/drawable/{f}', f'{MOB}/android/wear/src/main/res/drawable/{f}'))
    pub = 'apps/dashboard/public'
    for f in ('icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon-180.png'):
        c['dashboard'].append((f'web/{f}', f'{pub}/brand/{f}'))
    c['dashboard'] += [('web/og-1200x630.png', f'{pub}/brand/og-1200x630.png'),
                       ('web/mark.svg', f'{pub}/brand/mark.svg'),
                       ('web/favicon.svg', f'{pub}/favicon.svg'),
                       ('web/favicon.ico', f'{pub}/favicon.ico'),
                       ('web/wordmark-light.svg', f'{pub}/brand/wordmark-light.svg'),
                       ('web/wordmark-dark.svg', f'{pub}/brand/wordmark-dark.svg')]
    return c


# ------------------------------------------------------------------ config edits
def _sub(text, pattern, repl, label):
    new, k = re.subn(pattern, repl, text, count=1)
    if k == 0:
        raise ValueError(f'could not find {label}')
    return new


def edit_app_json(text):
    t = _sub(text, r'("adaptiveIcon"\s*:\s*\{[^{}]*?"backgroundColor"\s*:\s*")#[0-9A-Fa-f]{6}',
             r'\g<1>' + STEEL, 'adaptiveIcon.backgroundColor')
    t = _sub(t, r'("expo-splash-screen"\s*,\s*\{\s*"backgroundColor"\s*:\s*")#[0-9A-Fa-f]{6}',
             r'\g<1>' + STEEL, 'expo-splash-screen backgroundColor')
    t = _sub(t, r'("expo-splash-screen"[\s\S]*?"imageWidth"\s*:\s*)\d+',
             r'\g<1>' + str(SPLASH_IMAGE_WIDTH), 'expo-splash-screen imageWidth')
    blk = re.search(r'"expo-notifications"\s*,\s*\{([^{}]*)\}', t)
    if not blk:
        raise ValueError('could not find the expo-notifications plugin block')
    if '"icon"' not in blk.group(1):
        t = _sub(t, r'("expo-notifications"\s*,\s*\{)(\s*)("color"\s*:\s*")#[0-9A-Fa-f]{6}',
                 r'\g<1>\g<2>"icon": "./assets/images/notification-icon.png",\g<2>\g<3>' + FORGE,
                 'expo-notifications color')
    else:
        t = _sub(t, r'("expo-notifications"\s*,\s*\{[^{}]*?"color"\s*:\s*")#[0-9A-Fa-f]{6}',
                 r'\g<1>' + FORGE, 'expo-notifications color')
    # check the result means what we meant
    j = json.loads(t)['expo']
    assert j['android']['adaptiveIcon']['backgroundColor'] == STEEL
    plugins = {p[0]: p[1] for p in j['plugins'] if isinstance(p, list)}
    assert plugins['expo-splash-screen']['backgroundColor'] == STEEL
    assert plugins['expo-splash-screen']['android']['imageWidth'] == SPLASH_IMAGE_WIDTH
    assert plugins['expo-notifications']['color'] == FORGE
    assert plugins['expo-notifications']['icon'] == './assets/images/notification-icon.png'
    return t


def edit_colors_xml(text):
    t = text
    for name, val in (('splashscreen_background', STEEL), ('iconBackground', STEEL),
                      ('notification_icon_color', FORGE)):
        t = _sub(t, rf'(<color name="{name}">)#[0-9A-Fa-f]{{6,8}}(</color>)', r'\g<1>' + val + r'\g<2>', name)
    return t


EDITS = {
    'mobile': [(f'{MOB}/app.json', edit_app_json, 'adaptive icon + splash colour #1B1F26, splash imageWidth '
                f'{SPLASH_IMAGE_WIDTH}, notification icon + colour #F0662A'),
               (f'{RES}/values/colors.xml', edit_colors_xml,
                'splash + icon background #1B1F26, notification colour #F0662A')],
    'wear': [],
    'dashboard': [],
}


# ------------------------------------------------------------------ run
def git_dirty(rel):
    try:
        r = subprocess.run(['git', 'status', '--porcelain', '--', rel], cwd=ROOT,
                           capture_output=True, text=True, timeout=30)
        return bool(r.stdout.strip())
    except Exception:
        return False


def keep_header_comment(src_text, dst_path):
    """The dashboard's mark.svg carries a comment explaining it; keep it when replacing the art."""
    if not os.path.exists(dst_path):
        return src_text
    with open(dst_path, encoding='utf-8') as fh:
        old = fh.read()
    m = re.search(r'<!--[\s\S]*?-->', old)
    if not m or m.group(0) in src_text:
        return src_text
    return re.sub(r'(<svg[^>]*>)', r'\1\n' + m.group(0).replace('\\', '\\\\') + '\n', src_text, count=1)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--apply', action='store_true')
    ap.add_argument('--force', action='store_true')
    ap.add_argument('--only', choices=['mobile', 'wear', 'dashboard'])
    a = ap.parse_args()
    groups = [a.only] if a.only else ['mobile', 'wear', 'dashboard']
    plan = copies()
    counts = dict(new=0, replace=0, same=0, skipped=0, missing=0)
    print(('APPLYING' if a.apply else 'DRY RUN (add --apply to change files)') + f'  repo: {ROOT}\n')
    for g in groups:
        print(f'== {g}')
        for src, dst in plan[g]:
            sp = os.path.join(HERE, src)
            dp = os.path.join(ROOT, dst)
            if not os.path.exists(sp):
                print(f'  MISSING SOURCE  {src}  (run branding/mettleup/_src/make_assets.py)')
                counts['missing'] += 1
                continue
            if not os.path.exists(dp):
                state = 'new'
            elif dst.endswith('mark.svg'):
                state = 'replace'
            else:
                state = 'same' if filecmp.cmp(sp, dp, shallow=False) else 'replace'
            if state == 'replace' and git_dirty(dst) and not a.force:
                print(f'  SKIP (uncommitted edits there; --force to overwrite)  {dst}')
                counts['skipped'] += 1
                continue
            counts[state] += 1
            if state != 'same':
                print(f'  {state:<8} {dst}   <- {src}')
            if a.apply and state != 'same':
                os.makedirs(os.path.dirname(dp), exist_ok=True)
                if dst.endswith('mark.svg'):
                    with open(sp, encoding='utf-8') as fh:
                        txt = keep_header_comment(fh.read(), dp)
                    with open(dp, 'w', encoding='utf-8', newline='\n') as fh:
                        fh.write(txt)
                else:
                    shutil.copyfile(sp, dp)
        for dst, fn, what in EDITS[g]:
            dp = os.path.join(ROOT, dst)
            if not os.path.exists(dp):
                print(f'  MISSING TARGET  {dst}')
                continue
            with open(dp, encoding='utf-8') as fh:
                old = fh.read()
            try:
                new = fn(old)
            except (ValueError, AssertionError, KeyError, json.JSONDecodeError) as e:
                print(f'  EDIT FAILED, left alone: {dst}: {e}')
                continue
            if new == old:
                print(f'  same     {dst} (config already set)')
                continue
            if git_dirty(dst) and not a.force:
                print(f'  SKIP (uncommitted edits there; --force to overwrite)  {dst}: {what}')
                counts['skipped'] += 1
                continue
            print(f'  edit     {dst}: {what}')
            if a.apply:
                with open(dp, 'w', encoding='utf-8', newline='\n') as fh:
                    fh.write(new)
        print()
    print('  '.join(f'{k}: {v}' for k, v in counts.items()))
    if 'dashboard' in groups:
        print('\nDashboard note: apps/dashboard has its own generator (scripts/make-brand-assets.mjs) that\n'
              'rebuilds public/brand/*.png from public/brand/mark.svg. Re-running it after this replaces\n'
              'these PNGs with its own renders of the same mark. index.html does not yet link\n'
              '/favicon.svg; add  <link rel="icon" type="image/svg+xml" href="/favicon.svg">  there.')
    if not a.apply:
        print('\nNothing was changed. Run again with --apply.')


if __name__ == '__main__':
    sys.exit(main())
