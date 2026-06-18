// Runtime shims for older browsers. Imported FIRST in main.jsx so they run
// before any dependency's module body (notably pdfjs-dist) executes.
//
// pdf.js v6 calls Promise.withResolvers() throughout PDF parse/render. That API
// only exists in Chrome/Edge >= 119, Firefox >= 121, Safari >= 17.4 (late 2023+).
// On an older office machine the app still loads, but every PDF render throws
// "Promise.withResolvers is not a function" — and the viewer swallows render
// errors, so the preview just stays blank. This guarded polyfill fixes that and
// is a no-op on modern browsers (so Mac behavior is unchanged). Remove if/when
// the minimum supported browser is guaranteed to be newer.
if (typeof Promise.withResolvers !== 'function') {
  Promise.withResolvers = function withResolvers() {
    let resolve
    let reject
    const promise = new Promise((res, rej) => {
      resolve = res
      reject = rej
    })
    return { promise, resolve, reject }
  }
}
