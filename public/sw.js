const CACHE_NAME = 'life-tailors-v2';
const APP_SHELL = [
  './',
  './index.html',
  './css/style.css',
  './js/app.js',
  './js/firebase.js',
  './js/firebase-config.js',
  './assets/logo-splash.png',
  './assets/logo-header.png',
  './manifest.json'
];

// Version-pinned CDN files never change content for the same URL, so they're safe to
// serve straight from cache with no revalidation — this is what actually saves a slow
// round-trip on a weak mobile connection every time the app is opened.
const CDN_SHELL = [
  'https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js',
  'https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js',
  'https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js'
];

self.addEventListener('install', function(e){
  e.waitUntil(
    caches.open(CACHE_NAME).then(function(cache){
      return cache.addAll(APP_SHELL).then(function(){
        return Promise.all(CDN_SHELL.map(function(url){
          return fetch(url, { mode: 'cors' }).then(function(res){ return cache.put(url, res); }).catch(function(){});
        }));
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function(e){
  e.waitUntil(
    caches.keys().then(function(keys){
      return Promise.all(keys.filter(function(k){ return k !== CACHE_NAME; }).map(function(k){ return caches.delete(k); }));
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', function(e){
  if(e.request.method !== 'GET') return;
  const url = new URL(e.request.url);

  // Pinned Firebase SDK files: cache-first, no network needed once cached.
  if(CDN_SHELL.indexOf(e.request.url) !== -1){
    e.respondWith(
      caches.match(e.request).then(function(cached){
        return cached || fetch(e.request, { mode: 'cors' }).then(function(res){
          caches.open(CACHE_NAME).then(function(cache){ cache.put(e.request, res.clone()); });
          return res;
        });
      })
    );
    return;
  }

  // Everything else that isn't the app's own files (Firestore/Auth API calls, images
  // fetched by the page, etc.) goes straight to the network — data must stay live.
  if(url.origin !== self.location.origin) return;

  e.respondWith(
    caches.match(e.request).then(function(cached){
      const network = fetch(e.request).then(function(res){
        const copy = res.clone();
        caches.open(CACHE_NAME).then(function(cache){ cache.put(e.request, copy); });
        return res;
      }).catch(function(){ return cached; });
      return cached || network;
    })
  );
});
