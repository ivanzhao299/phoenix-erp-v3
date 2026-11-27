const fs=require('node:fs');
const path=require('node:path');

module.exports=(request,options)=>{
  const resolved=options.defaultResolver(request,options);
  const candidate=process.env.EGG_SOURCE_CANDIDATE_DIST;
  if (!candidate||!resolved.startsWith(options.rootDir+path.sep+'src'+path.sep)) return resolved;
  const relative=path.relative(path.join(options.rootDir,'src'),resolved);
  if (!relative.endsWith('.ts')||relative.endsWith('.spec.ts')) return resolved;
  const compiled=path.join(candidate,relative.replace(/\.ts$/,'.js'));
  // Fixture helpers are excluded from the production image. Its production
  // services, controllers and migrations must always resolve to compiled JS.
  if (relative.endsWith('.pg-fixture.ts')&&!fs.existsSync(compiled)) return resolved;
  if (!fs.existsSync(compiled)) throw Error('Published API image is missing '+relative);
  return compiled;
};
