import {readFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';

// Instantiate the existing clinic modules in another scene, without editing or forking their effect code.
// Only scene/state imports and the missing load promise are adapted; the original effect bodies are retained.
export function clinicEffects(){
  const ids={'virtual:clinic-xray':'src/scene/xray.js','virtual:clinic-audio':'src/audio/audio.js'};
  return {
    name:'clinic-effects',
    resolveId(id){if(ids[id])return '\0'+id;},
    load(id){
      const publicId=id.slice(1),file=ids[publicId];if(!file)return;
      const filename=resolve(file);this.addWatchFile(filename);
      let source=readFileSync(filename,'utf8'),imports=[];
      source=source.replace(/^import[\s\S]*?from\s+["']([^"']+)["'];\s*$/gm,(line,path)=>{
        if(/\/(patientModel|renderer|realAssets|state|tuning)\.js$/.test(path))return '';
        imports.push(line.replace(path,path.startsWith('.')?resolve(dirname(filename),path):path));return '';
      });
      source=source.replace(/^export /gm,'');
      if(publicId==='virtual:clinic-xray'){
        source=source.replace('function loadSpine(){\n  Promise.all','function loadSpine(){\n  return Promise.all');
        return imports.join('\n')+'\nexport function createClinicXray({pivot,scene,camera,loadModel,getEnv}){\n'+source+'\nreturn {loadSpine,updateXray,XRAY_LEVEL,XRAY_PRE,FRAC_HIT,root,film};\n}';
      }
      return imports.join('\n')+'\nexport function createClinicAudio({S,T}){\n'+source+'\nreturn {ensureAudio,crackSound,fizzle,knuckle,boing,crunch,siren,stopSiren,tone,chime,vib,setAmbient,suspend:sleep,resume:wake};\n}';
    }
  };
}
