#!/bin/bash
set -e

# 1. Generate Icons (from master_icon.png which is 1024x1024)
sips -z 128 128 master_icon.png --out icon128.png
sips -z 48 48 master_icon.png --out icon48.png
sips -z 16 16 master_icon.png --out icon16.png

# 2. Generate Promo Small (440x280)
# Center icon on white background
/opt/homebrew/bin/ffmpeg -hide_banner -loglevel error -y -f lavfi -i color=c=white:s=440x280 -i master_icon.png -filter_complex "[1:v]scale=-1:200[icon];[0:v][icon]overlay=(W-w)/2:(H-h)/2" promo_small.png

# 3. Generate Promo Marquee (1400x560)
# White background, Icon on left, Text on right? Or Centered?
# User liked v1 before (Centered Text).
# But for Marquee with Icon, maybe Icon Left + Text Right looks balanced?
# Or Centered Icon + Text Overlay?
# Let's try: Centered Icon (faded/background) or Icon Left?
# Actually, let's keep it simple: White background, Large Icon on Left, Text on Right.
# Wait, user liked "v1" for the previous marquee which was "MoneyForward Asset Graph" text.
# Let's replicate v1 style: Icon + Text. 
# Plan: 
# Background: White
# Icon: Left side, large
# Text: "MoneyForward Asset Graph", Dark Grey (since bg is white), Scaled
# Let's do:
# [Icon 500px] [Text Area]
# Actually, the user liked the "v1" text overlay which had a BOX.
# But now the background is white. Black text is better.
# Let's try:
# Background: White
# Icon: Positioned at x=200, centered vertically.
# Text: "MoneyForward", "Asset Graph" (2 lines) at x=600.
# Font: Arial Bold, Color: #333333

/opt/homebrew/bin/ffmpeg -hide_banner -loglevel error -y -f lavfi -i color=c=white:s=1400x560 -i master_icon.png -filter_complex "
[1:v]scale=-1:460[icon];
[0:v][icon]overlay=100:(H-h)/2[bg_icon];
[bg_icon]drawtext=fontfile='/System/Library/Fonts/Supplemental/Arial Bold.ttf':text='MoneyForward':fontcolor=#333333:fontsize=90:x=600:y=180,
drawtext=fontfile='/System/Library/Fonts/Supplemental/Arial Bold.ttf':text='Asset Graph':fontcolor=#333333:fontsize=90:x=600:y=300
" promo_marquee.png

echo "Assets generated."
