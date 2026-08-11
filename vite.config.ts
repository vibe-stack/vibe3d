import { defineConfig } from 'vite'

export default defineConfig({
  resolve: {
    alias: [
      // Three's addons import `three`. Keep them on the same WebGPU build used
      // by the rest of the playground instead of loading a second Three copy.
      { find: /^three$/, replacement: 'three/webgpu' },
    ],
  },
})
