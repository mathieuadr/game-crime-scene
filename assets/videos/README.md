## Background Video

Place a looping background video as `bg-loop.mp4` in this directory.

The video plays behind the landing/setup screen with a dark overlay.
Ideal: moody, noir, atmospheric — rain, desk lamp, typewriter, etc.

Suggested royalty-free sources:
1. Rain on window: https://www.pexels.com/video/rain-drops-on-glass-window-2491284/
2. Desk lamp: https://www.pexels.com/video/a-lamp-on-a-wooden-desk-4065924/
3. Typewriter: https://pixabay.com/videos/typewriter-typing-machine-letters-44814/

Download one and rename to `bg-loop.mp4`.
Keep file size under 5MB for fast loading (compress with ffmpeg if needed):
  ffmpeg -i input.mp4 -vf scale=1280:-2 -b:v 800k -an bg-loop.mp4
