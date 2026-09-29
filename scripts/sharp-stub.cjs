// Stands in for sharp in the voice-worker bundle: transformers.js imports it
// for image models, which the built-in voice never loads.
module.exports = () => { throw new Error('Image processing is not available in the voice worker.'); };
