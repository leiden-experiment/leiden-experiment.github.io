'use strict';
/** Semantic compile of the real Options scene against SDK stand-ins.
 * Intended to catch TS property/type errors despite unavailable Phaser/Firebase npm packages. */
const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs');
const ts=(()=>{try{return require('typescript')}catch{return require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript')}})();
const root=path.resolve(__dirname,'..');
const file=relative=>path.join(root,'src/ts',relative);
const mocked=new Map([
 ['scenes/handScene.ts', `export default class HandScene { constructor(k:string){} width=1920;height=1080;center={x:960,y:540};add:any={};input:any={};events:any={};hand:any={};scene:any={};tweens:any={};create(){}update(t:number,d:number){}setOpacity(o:number){} }`],
 ['study/runtime.ts', 'export function getStudySession(): null | {settings:{weeks:Record<string,Array<{type:string;allowedSettings?:string[]}>>;defaultConfig?:Record<string,unknown>;groupConfigs?:Record<string,Record<string,unknown>>;participantSettingsAllowed?:string[]};account:{group?:string;customConfig?:Record<string,unknown>;participantPreferences?:Record<string,unknown>};mode:"online"|"offline"} {return null;} export function updateParticipantPreferences(p:Record<string,unknown>):void {}'],
 ['study/firebaseClient.ts','export const studyApi:any={};'],
 ['study/offline.ts','export const getOfflinePack=():any=>null;export const importOfflinePack=(x:any):void=>{};'],
 ['ui/button.ts','export class Button {constructor(...args:any[]){} x=0;y=0;displayWidth=400;text?:any;setScale(n:number){return this;} }'],
 ['ui/slider.ts','export class Slider {constructor(a:any,b:any,c:any,d:any,e:any,f:any,g:any,cb:(slider:Slider)=>void){}label?:any;key:string="";active=true;getValue(){return 0}getStringValue(){return ""}setValue(n:number):void{}setIsInteger(x:boolean){return this}reset(x:any):void{}hide(x?:string):void{}draw():void{} }'],
 ['ui/checkbox.ts','export class Checkbox {constructor(a:any,b:any,c:any,d:any,e:any,f:any,g:any,cb:(checkbox:Checkbox)=>void){}key:string="";isChecked=true;reset(x:any):void{}hide():void{} }'],
 ['managers/storageManager.ts','import {ConfigData} from "../core/interfaces";export let config:ConfigData;export let defaultConfig:ConfigData;export const updateConfig=(x:ConfigData,b?:boolean):void=>{};export const updateConfigValue=(key:keyof ConfigData,v:unknown):void=>{};'],
 ['objects/webcam.ts','const webcam:any={setVisibility(x:boolean){}};export default webcam;'],
 ['core/phaserTypes.ts','export class Vector2 {x:number;y:number;constructor(x:number,y:number){this.x=x;this.y=y}}export type EventEmitter=any;export type Sprite=any;export type Tween=any;'],
 ['core/config.ts','export const escapeKey="";export const fingerColors:any={};export const optionsCheckboxOffset:any={};export const optionsSliderLabelOffset:any={};export const targetGlowOptions:any={};export const thumbFingerId="thumb";export const undefinedText="";'],
 ['core/common.ts','export function assert(x:any,y?:string):void{}'],
 ['core/interfaces.ts','export interface ConfigData {[key:string]:any;targetSize:number;fingerSize:number;pinchVolume:number;backgroundMusicVolume:number;cameraOpacity:number;enableCameraVisibility:boolean;onTimeDuration:number;postProcessingDisabled:boolean;}'],
].map(([rel,value])=>[file(rel),value]));
const declaration=file('scene-test-globals.d.ts');
mocked.set(declaration,'declare namespace Phaser { namespace FX { interface Glow {outerStrength:number} } } interface Window { electron?: unknown }');
const options={target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.ES2015,moduleResolution:ts.ModuleResolutionKind.Node10,strict:true,strictPropertyInitialization:false,skipLibCheck:true,noEmit:true,types:[],lib:['lib.dom.d.ts','lib.esnext.d.ts']};
const host=ts.createCompilerHost(options);const original=host.getSourceFile.bind(host);
host.getSourceFile=(name,...args)=>mocked.has(name)?ts.createSourceFile(name,mocked.get(name),ts.ScriptTarget.Latest,true):original(name,...args);
const program=ts.createProgram([file('scenes/optionsScene.ts'),file('study/gameplayFields.ts'),declaration],options,host);
const errors=ts.getPreEmitDiagnostics(program);
assert.equal(errors.length,0,ts.formatDiagnostics(errors, {getCanonicalFileName:x=>x,getCurrentDirectory:()=>root,getNewLine:()=> '\n'}));
console.log('PASS: OptionsScene semantic TypeScript compile with SDK stand-ins (full browser build still required)');
