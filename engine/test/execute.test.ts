import {describe,it,expect} from 'vitest';
import {executeRemainingHealth, simulate, loadCalibration} from '../src/sim.js';
import {emptyEffects} from '../src/effects.js';
import {loadData} from '../src/data.js';
const data=loadData(), cal=loadCalibration(), kit=data.kits.get('kira')!;
const profile={...cal.referenceProfiles.squishy!,health:10000};
const base=emptyEffects(), exec={...base,executeThresholdPct:5};
const run=(effects=base,executeTargetState?:{health:number;shield:number})=>simulate(kit,[],{level:13,profile,effects,executeTargetState},cal);
describe('Vanquisher post-damage execute',()=>{
 it('uses inclusive health plus shield and credits actual remaining health',()=>{
  expect(executeRemainingHealth(50,0,1000,5)).toBe(50);
  expect(executeRemainingHealth(20,30,1000,5)).toBe(20);
  expect(executeRemainingHealth(20,31,1000,5)).toBe(0);
  expect(executeRemainingHealth(51,0,1000,5)).toBe(0);
 });
 it('does not execute dead or invalid target states',()=>{
  for(const hp of [0,-10,NaN,Infinity])expect(executeRemainingHealth(hp,0,1000,5)).toBe(0);
  expect(executeRemainingHealth(10,-1,1000,5)).toBe(0);
 });
 it('awards no free damage against a healthy target',()=>{
  expect(run(exec).burstCombo).toBe(run().burstCombo);
 });
 it('credits only a qualifying surviving remainder, once for teamfight output',()=>{
  const raw=run(), state={health:raw.burstCombo+100,shield:0};
  const r=run(exec,state);
  expect(r.burstCombo-raw.burstCombo).toBeCloseTo(100);
  expect(r.teamfightBurst-raw.teamfightBurst).toBeCloseTo(100);
 });
 it('does not add damage after a natural kill or through an obstructing shield',()=>{
  const raw=run();
  expect(run(exec,{health:raw.burstCombo-1,shield:0}).burstCombo).toBe(raw.burstCombo);
  expect(run(exec,{health:100,shield:raw.burstCombo+401}).burstCombo).toBe(raw.burstCombo);
  expect(run(exec,{health:100,shield:raw.burstCombo+400}).burstCombo).toBeCloseTo(raw.burstCombo+100);
 });
});
