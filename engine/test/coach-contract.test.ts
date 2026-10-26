import { expect, it } from 'vitest';
import path from 'node:path';
import { loadCoachingPreset } from '../src/coaching-presets.js';
import { reviewDigest, selectReviewScope, validateCoachContract, validatePublication } from '../src/coach-contract.js';
const root = path.resolve('..');
const match = () => ({ matchId: 'abc-123', players: [{pid:'p', us:true}], coaching: {personaId:loadCoachingPreset(root).id,headline:'Finish the damn job.',team:'The final push ended it. Keep that commitment.',focus:{action:'Call the next objective before chasing.'},perPlayer:{},playerBullets:{p:['Sparrow delivered. Keep the damage coming without giving away the shutdown.','When the fight ends, call the safe structure before pursuing another target.']},moments:{final:{call:'The Core fell after the final fight.'}}} });
it('accepts concise paragraphs without forcing criticism or cards', () => expect(()=>validateCoachContract(root,match())).not.toThrow());
it.each(['old',''])('rejects stale or absent persona %s', id => { const f=match();f.coaching.personaId=id;expect(()=>validateCoachContract(root,f)).toThrow('personaId'); });
it('rejects missing allied advice and invisible string moments', () => { const f:any=match();f.players.push({pid:'q',us:true});expect(()=>validateCoachContract(root,f)).toThrow('every allied');f.players.pop();f.coaching.moments.final='Hidden evidence';expect(()=>validateCoachContract(root,f)).toThrow('call string'); });
it.each(['Keep: do this. Change: do that.', 'Good job at 12:34.', 'Good job at 12.5m.', 'First paragraph.\nSecond paragraph.', 'Good job\u2014do it again.'])('rejects old presentation: %s', text => {const f=match();f.coaching.playerBullets.p[0]=text;expect(()=>validateCoachContract(root,f)).toThrow();});
it('rejects duplicated card advice',()=>{const f:any=match();f.coaching.microReads={p:{keep:'Same advice'}};expect(()=>validateCoachContract(root,f)).toThrow('duplicate');});
it('requires explicit, unambiguous complete scope',()=>{const games=[match(),{...match(),matchId:'abc-456'}];for(const scope of [[],['missing'],['abc'],['abc-1','missing']])expect(()=>selectReviewScope(games,scope)).toThrow();expect(selectReviewScope(games,['abc-1'])).toEqual([games[0]]);});
it('blocks publication after copy or facts change',()=>{const f=match();const report={reviewedLines:5,flaggedLines:0,unmatched:0,rewritesDropped:0,reviewedDigests:{[f.matchId]:reviewDigest(f)}};expect(()=>validatePublication([f],report)).not.toThrow();f.coaching.team='Changed after critique.';expect(()=>validatePublication([f],report)).toThrow();const original=match();(original.players[0] as any).kills=5;expect(()=>validatePublication([original],report)).toThrow();});
it('rejects flagged, dropped, incomplete or empty critic results',()=>{const f=match();const clean={reviewedLines:5,flaggedLines:0,unmatched:0,rewritesDropped:0,reviewedDigests:{[f.matchId]:reviewDigest(f)}};for(const report of [{...clean,flaggedLines:1},{...clean,unmatched:1},{...clean,rewritesDropped:1},{...clean,reviewedDigests:{}},{...clean,reviewedLines:0}])expect(()=>validatePublication([f],report)).toThrow();});

it('requires reflection for losses under the active reflection preset, never wins',()=>{
 const f:any=match(); f.result='loss';
 expect(()=>validateCoachContract(root,f)).toThrow('lossReflection');
 f.coaching.lossReflection='Prepare a safe approach together before the contest, or call a reachable trade.';
 expect(()=>validateCoachContract(root,f)).not.toThrow();
 f.result='win'; expect(()=>validateCoachContract(root,f)).toThrow('only on losses');
});
it('validates reflection readability and length like the main review',()=>{
 const f:any=match(); f.result='loss'; f.coaching.lossReflection='Reset at 12:34.';
 expect(()=>validateCoachContract(root,f)).toThrow('exact time');
 f.coaching.lossReflection='word '.repeat(101); expect(()=>validateCoachContract(root,f)).toThrow('too long');
});

it('requires complete role-specific build analysis for every ally when enabled',()=>{
 const f:any=match(); f.coaching.buildAnalysisVersion=1;
 expect(()=>validateCoachContract(root,f)).toThrow('build analysis missing');
 f.coaching.buildReads={p:Object.fromEntries(['matchup','build','eternal','augment','crest','improvement'].map(k=>[k,'A grounded matchup tradeoff.']))};
 expect(()=>validateCoachContract(root,f)).not.toThrow();
 delete f.coaching.buildReads.p.augment; expect(()=>validateCoachContract(root,f)).toThrow('augment');
});

it.each([[], ['Only one'], ['a','b','c','d'], ['a','']])('rejects incomplete or excessive bullets %j', value => { const f:any=match();f.coaching.playerBullets.p=value;expect(()=>validateCoachContract(root,f)).toThrow(); });

it('requires short bullet arrays for version 2 build analysis',()=>{
 const f:any=match(); f.coaching.buildAnalysisVersion=2;
 f.coaching.buildReads={p:Object.fromEntries(['matchup','build','eternal','augment','crest','improvement'].map(k=>[k,['A grounded matchup tradeoff.','Keep the core.']]))};
 expect(()=>validateCoachContract(root,f)).not.toThrow();
 f.coaching.buildReads.p.crest='A paragraph.'; expect(()=>validateCoachContract(root,f)).toThrow('crest');
 f.coaching.buildReads.p.crest=['a','b','c','d']; expect(()=>validateCoachContract(root,f)).toThrow('more than 3');
 f.coaching.buildReads.p.crest=['word '.repeat(23)]; expect(()=>validateCoachContract(root,f)).toThrow('too long');
});
