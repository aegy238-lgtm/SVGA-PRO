// Service Worker helper for Android PWA Web Share Target and file handling
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Intercept Web Share Target POST request from Android
  if (event.request.method === 'POST' && (url.pathname === '/share-target' || url.pathname === '/share-target/')) {
    event.respondWith(
      (async () => {
        try {
          const formData = await event.request.formData();
          const mediaFiles = formData.getAll('mediaFiles');

          if (mediaFiles && mediaFiles.length > 0) {
            const cache = await caches.open('pwa-shared-media-v1');
            
            // Clean up any stale items first
            const existingKeys = await cache.keys();
            for (const key of existingKeys) {
              if (key.url.includes('/shared-file-temp-')) {
                await cache.delete(key);
              }
            }

            for (let i = 0; i < mediaFiles.length; i++) {
              const file = mediaFiles[i];
              if (file && typeof file === 'object') {
                const headers = new Headers({
                  'Content-Type': file.type || 'application/octet-stream',
                  'X-File-Name': encodeURIComponent(file.name || `shared_${Date.now()}_${i}`),
                  'X-File-Index': String(i),
                  'X-Total-Files': String(mediaFiles.length)
                });
                await cache.put(
                  new Request(`/shared-file-temp-${i}`),
                  new Response(file, { headers })
                );
              }
            }
          }
        } catch (err) {
          console.error('[SW Share Target] Error processing shared files:', err);
        }

        // Redirect with 303 See Other back to app with shared query flag
        return Response.redirect('/?shared=1&t=' + Date.now(), 303);
      })()
    );
  }
});
