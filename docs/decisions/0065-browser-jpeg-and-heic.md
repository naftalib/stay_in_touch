# Browser JPEG resize and lazy HEIC

## Context
Supabase Storage does not transform images on the free plan. Originals from phones are large and often contain GPS.

## Options considered
- Store the original file and resize on a server.
- Resize in the browser to a 2048-pixel JPEG and a 400-pixel thumbnail before upload.

## Decision
The browser draws the photo to a canvas (a worker when `OffscreenCanvas` works, otherwise the main thread). The long edge is at most 2048 for the full image and 400 for the thumbnail. Smaller photos are not upscaled. Output is JPEG at quality 0.85 and 0.8, retried at 0.6 if either file is still over 5 MB. Canvas encoding strips EXIF, including GPS. HEIC is detected from the `ftyp` brand. `heic-to` 1.6.7 (LGPL-3.0) is loaded with a dynamic import only after a normal decode fails, so the chunk is not on the first page load.

## Consequences
The stored object is a new JPEG, not the camera file. A photo that still exceeds 5 MB after the second encode is refused. The HEIC decoder is a separate chunk (`heic-to` in the build output).

## Status
Accepted

## Date
2026-11-15
