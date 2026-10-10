import {defineConfig} from 'vite';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
export default defineConfig({
  base:process.env.PAGES_BASE_PATH||'/',
  build:{rollupOptions:{input:{workspace:'index.html',studio:'studio.html'}}},
  plugins:[{
    name:'offline-lesson-assets',
    generateBundle(options,bundle){
      const files=Object.keys(bundle).filter(name=>/\.(js|css)$/.test(name));
      const assets=['./','./index.html','./studio.html','./schema/lesson.schema.json',...files.map(name=>'./'+name)];
      const version=createHash('sha256').update(files.join('|')).digest('hex').slice(0,12);
      const source=readFileSync('service-worker.js','utf8').replace(/const CACHE_NAME = .*;/,`const CACHE_NAME = 'lesson-presenter-fabric-${version}';`).replace(/const ASSETS = .*;/,`const ASSETS = ${JSON.stringify(assets)};`);
      this.emitFile({type:'asset',fileName:'service-worker.js',source});
    }
  }]
});
