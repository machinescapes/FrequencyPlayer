import { createAssetServer } from 'remix/assets'
export const assets = createAssetServer({basePath:'/assets',rootDir:process.cwd(),allowFiles:['app/routes.ts','app/**/public/**'],allowPackages:['remix'],minify:process.env.NODE_ENV==='production'})
export const scriptEntry = await assets.getScriptEntry('app/public/entry.tsx')
