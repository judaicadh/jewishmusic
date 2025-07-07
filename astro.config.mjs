// @ts-check
import { defineConfig } from 'astro/config';
import netlify from "@astrojs/netlify";

import react from '@astrojs/react';
import partytown from '@astrojs/partytown';
import tailwindcss from "@tailwindcss/vite";
import flowbiteReact from "flowbite-react/plugin/astro";

// https://astro.build/config
export default defineConfig({

    site: 'https://music.judaicadhpenn.org',
    base: '/',
    output: 'static',
    adapter: netlify(),

  vite: {
    plugins: [tailwindcss()],
  },
  integrations: [react(), partytown(), flowbiteReact()]
});