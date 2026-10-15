// Offline validation readiness and controlled historical-core diagnostics.
import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {loadData} from '../data.js';
import {loadCalibration,unverifiedConstants} from '../sim.js';
import {agreementFromEvidence,buildEvidencePatch,type BuildEvidence} from '../agreement.js';
import {compareBuilds} from '../build-comparison.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const read=(p:string)=>JSON.parse(readFileSync(path.join(root,p),'utf8'));
const data=loadData(),cal=loadCalibration();
const source=read('data/aggregates/predgg-builds.json') as BuildEvidence;
const meta=read('data/catalog/META.json');
const rows:any[]=[],skipped:any[]=[];
for(const kit of data.kits.values()){
  const artifact=read(`data/artifacts/${kit.slug}.json`);
  for(const view of artifact.roles??[]){
    const agreement=agreementFromEvidence([{items:view.build.items.map((i:any)=>i.name)}],kit.slug,data.itemsBySlug,source,meta.patch,{role:view.role});
    if(!agreement?.topCore){skipped.push({hero:kit.slug,role:view.role,reason:'No valid observed three-item core with at least 20 games'});continue;}
    const field=agreement.topCore.items.map(n=>data.items.get(n)!);
    const candidate=view.build.items.slice(0,3).map((i:any)=>data.itemsBySlug.get(i.slug));
    if(candidate.some((i:any)=>!i)){skipped.push({hero:kit.slug,role:view.role,reason:'Unmapped candidate item'});continue;}
    rows.push({hero:kit.slug,role:view.role,evidence:agreement.evidence,
      observed:{items:agreement.topCore.items,games:agreement.topCore.n,wins:agreement.topCore.w},
      scenarios:[9,13,18].flatMap(level=>[6000,9000,12000].map(budget=>compareBuilds(kit,field,candidate,level,budget,cal)))});
  }
}
const eligible=rows.filter(r=>r.evidence.currentMetaEligible);
const out={
  generatedAt:new Date().toISOString(),catalogPatch:meta.patch,
  status:eligible.length?'descriptive-current-patch-coverage-only':'current-meta-validation-blocked',
  evidencePatch:buildEvidencePatch(source),evidenceFetchedAt:source.generatedAt,
  summary:{heroRoleComparisons:rows.length,currentPatchLaneEligible:eligible.length,controlledScenarios:rows.reduce((s,r)=>s+r.scenarios.length,0),
    holdoutValidated:false,winningBuildsConfirmed:0},
  limitations:[
    'Historical cores are diagnostic inputs, not the current meta. Hero-wide fallback comparisons are labeled and not lane validation.',
    'Current patch item marginals cannot reconstruct joint builds or purchase order. No synthetic build observations are invented.',
    'Same gold CAP is not identical spending: completed-item prefixes preserve purchase order and report residual gold; components are unmodeled.',
    'All scenarios exclude Eternals and augments equally and use the engine reference defenses. Conditional effects and unsupported mechanics remain incomplete.',
    'This evidence has been inspected during development and is not a held-out evaluation. No predicted win probability or causal build advantage is reported.',
    'Future validation must freeze model/predictions before collecting a later patch-matched ranked sample, preserve match IDs for split isolation, and separate hero/role/rank/opponent/duration/completion cohorts.',
  ],
  unverifiedConstants:unverifiedConstants(cal),skipped,rows,
};
writeFileSync(path.join(root,'data/aggregates/meta-validation.json'),JSON.stringify(out,null,1)+'\n');
console.log(JSON.stringify({status:out.status,evidencePatch:out.evidencePatch,...out.summary}));
