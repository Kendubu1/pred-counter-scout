import { expect, it } from 'vitest';
import path from 'node:path';
import { loadCoachingPreset } from '../src/coaching-presets.js';
import { reviewDigest, selectReviewScope, validateCoachContract, validatePublication } from '../src/coach-contract.js';
const root = path.resolve('..');
const match = () => ({ matchId: 'abc-123', players: [{pid:'p', us:true, heroName:'Steel', squadName:'Goldilocks324', name:'Goldilocks324'}], interrogation: {gameFlags:[{id:'no-close'},{id:'standout:p'}]}, coaching: {personaId:loadCoachingPreset(root).id,headline:'Finish the damn job.',team:'',flags:[{ref:'no-close',text:'Two inhibitors down and we never touched the Core.'},{ref:'other',text:'The bot lane held even all game.'}],focus:{action:'Call the next objective before chasing.'},perPlayer:{},playerBullets:{p:['Sparrow delivered. Keep the damage coming without giving away the shutdown.','When the fight ends, call the safe structure before pursuing another target.']},moments:{final:{call:'The Core fell after the final fight.'}}} });
it('accepts concise paragraphs without forcing criticism or cards', () => expect(()=>validateCoachContract(root,match())).not.toThrow());
it.each(['old',''])('rejects stale or absent persona %s', id => { const f=match();f.coaching.personaId=id;expect(()=>validateCoachContract(root,f)).toThrow('personaId'); });
it('rejects missing allied advice and invisible string moments', () => { const f:any=match();f.players.push({pid:'q',us:true});expect(()=>validateCoachContract(root,f)).toThrow('every allied');f.players.pop();f.coaching.moments.final='Hidden evidence';expect(()=>validateCoachContract(root,f)).toThrow('call string'); });
it.each(['Keep: do this. Change: do that.', 'Good job at 12:34.', 'Good job at 12.5m.', 'First paragraph.\nSecond paragraph.', 'Good job\u2014do it again.'])('rejects old presentation: %s', text => {const f=match();f.coaching.playerBullets.p[0]=text;expect(()=>validateCoachContract(root,f)).toThrow();});
it('rejects duplicated card advice',()=>{const f:any=match();f.coaching.microReads={p:{keep:'Same advice'}};expect(()=>validateCoachContract(root,f)).toThrow('duplicate');});
it('requires explicit, unambiguous complete scope',()=>{const games=[match(),{...match(),matchId:'abc-456'}];for(const scope of [[],['missing'],['abc'],['abc-1','missing']])expect(()=>selectReviewScope(games,scope)).toThrow();expect(selectReviewScope(games,['abc-1'])).toEqual([games[0]]);});
it('blocks publication after copy or facts change',()=>{const f=match();const report={reviewedLines:5,flaggedLines:0,unmatched:0,rewritesDropped:0,reviewedDigests:{[f.matchId]:reviewDigest(f)}};expect(()=>validatePublication([f],report)).not.toThrow();f.coaching.team='Changed after critique.';expect(()=>validatePublication([f],report)).toThrow();const original=match();(original.players[0] as any).kills=5;expect(()=>validatePublication([original],report)).toThrow();});
it('rejects flagged, dropped, incomplete or empty critic results',()=>{const f=match();const clean={reviewedLines:5,flaggedLines:0,unmatched:0,rewritesDropped:0,reviewedDigests:{[f.matchId]:reviewDigest(f)}};for(const report of [{...clean,flaggedLines:1},{...clean,unmatched:1},{...clean,rewritesDropped:1},{...clean,reviewedDigests:{}},{...clean,reviewedLines:0}])expect(()=>validatePublication([f],report)).toThrow();});

it('flags replace the team paragraph and loss reflection',()=>{
 const f:any=match(); f.result='loss';
 expect(()=>validateCoachContract(root,f)).not.toThrow();
 f.coaching.lossReflection='Reset together next time.'; expect(()=>validateCoachContract(root,f)).toThrow('replace');
 f.coaching.lossReflection=''; f.coaching.team='A team paragraph.'; expect(()=>validateCoachContract(root,f)).toThrow('replace');
});
it('requires 2-4 short flags citing computed game flags',()=>{
 const f:any=match();
 f.coaching.flags=[f.coaching.flags[0]]; expect(()=>validateCoachContract(root,f)).toThrow('2-4');
 f.coaching.flags=[{ref:'invented',text:'Made up.'},{ref:'other',text:'Fine.'}]; expect(()=>validateCoachContract(root,f)).toThrow('gameFlags id');
 f.coaching.flags=[{ref:'no-close',text:'One.'},{ref:'no-close',text:'Two.'}]; expect(()=>validateCoachContract(root,f)).toThrow('twice');
 f.coaching.flags=[{ref:'no-close',text:'word '.repeat(19)},{ref:'other',text:'Fine.'}]; expect(()=>validateCoachContract(root,f)).toThrow('18 words');
 f.coaching.flags=[{ref:'no-close',text:'Core fell at 37:50.'},{ref:'other',text:'Fine.'}]; expect(()=>validateCoachContract(root,f)).toThrow('exact time');
});
it('spends profanity on the big moments only: three words maximum, none in the lesson',()=>{
 const f:any=match();
 f.coaching.focus.action='Call the next damn objective.'; expect(()=>validateCoachContract(root,f)).toThrow('clean');
 f.coaching.focus.action='Call the next objective before chasing.';
 f.coaching.flags[1].text='Shit fight, fucking awful, hell no.'; expect(()=>validateCoachContract(root,f)).toThrow('maximum 3');
 f.coaching.flags[1].text='Fucking awful fight.'; expect(()=>validateCoachContract(root,f)).not.toThrow();
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

it('player bullets never repeat that player\'s own name or hero, and stay at 30 words',()=>{
 const f:any=match();
 f.coaching.playerBullets.p[0]='Steel ran the vision with the most wards in the game.'; expect(()=>validateCoachContract(root,f)).toThrow('repeats "Steel"');
 f.coaching.playerBullets.p[0]='Goldilocks324 ran the vision.'; expect(()=>validateCoachContract(root,f)).toThrow('repeats "Goldilocks324"');
 f.coaching.playerBullets.p[0]='Ran the vision: the most wards in the game, over the Sparrow carry too.'; expect(()=>validateCoachContract(root,f)).not.toThrow();
 f.coaching.playerBullets.p[0]='word '.repeat(31); expect(()=>validateCoachContract(root,f)).toThrow('maximum 30');
});
