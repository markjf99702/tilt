// Tilt moved into the Free Play arcade (https://free-play.junkdrawer.works/tilt/). This takes the place of the old offline copy: it clears
// what that kept and steps aside, so a phone with Tilt on its home screen loads the page that sends it on.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const key of await caches.keys()) await caches.delete(key);
    await self.registration.unregister();
    for (const client of await self.clients.matchAll({ type: 'window' })) client.navigate(client.url);
  })());
});
