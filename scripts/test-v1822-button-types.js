'use strict';
/** Type-check and exercise the actual button class with Phaser-compatible stand-ins.
 * This intentionally does not claim a complete webpack/browser build. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const ts=(()=>{try{return require('typescript')}catch{return require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript')}})();
const root=path.resolve(__dirname,'..');
const file=rel=>path.join(root,'src/ts',rel);
const mocks=new Map([
 ['core/config.ts',`export const buttonDepth=10,buttonHoverTint=1,buttonPinchFinger='index',buttonTextHoverTint=1;export const buttonTextStyle: any={font:'50px Courier New'};`],
 ['core/interfaces.ts',`export interface PinchCallbacks {startPinch?:()=>void;pinched?:()=>void;endPinch?:()=>void;startHover?:()=>void;endHover?:()=>void}`],
 ['core/phaserTypes.ts',`export interface PhaserText {text:string;displayWidth:number;displayHeight:number;width:number;height:number;visible:boolean;scale:number;setOrigin(a:number,b:number):this;setAlign(s:string):this;setPosition(x:number,y:number):this;setDepth(n:number):this;setMaxLines(n:number):this;setFontSize(n:number):this;setWordWrapWidth(n:number|null,b?:boolean):this;setScale(n:number):this;setTintFill(n:number):this;clearTint():this;}export type Vector2={x:number;y:number};export interface AudioTrack {play(c:any):void;}export class MatterSprite {displayWidth=400;displayHeight=200;x=0;y=0;tint=0;constructor(...args:any[]){}getCenter():Vector2{return {x:0,y:0}}setScale(x:number,y?:number):this{return this}setOrigin(x:number,y:number):this{return this}setSensor(x:boolean):this{return this}setDepth(x:number):this{return this}setTintFill(n:number):this{return this}clearTint():this{return this}on(n:string,f:any):this{return this}off(n:string,f:any):this{return this}}`],
 ['managers/storageManager.ts',`export const config={pinchVolume:1,uiPinchesEnabled:true};`],
 ['scenes/handScene.ts',`export default class HandScene {matter:any;add:any;sound:any;hand:any;}`],
 ['util/interaction.ts',`export default function setInteraction(...args:any[]):void{}`],
 ['study/runtime.ts',`export function getStudySession(): any {return null;}`],
].map(([r,x])=>[file(r),x]));
const opts={target:ts.ScriptTarget.ES2015,module:ts.ModuleKind.ES2015,moduleResolution:ts.ModuleResolutionKind.Node10,strict:true,skipLibCheck:true,noEmit:true,types:[],lib:['lib.dom.d.ts','lib.esnext.d.ts']};
const host=ts.createCompilerHost(opts);const original=host.getSourceFile.bind(host);
host.getSourceFile=(name,...rest)=>mocks.has(name)?ts.createSourceFile(name,mocks.get(name),ts.ScriptTarget.Latest,true):original(name,...rest);
const program=ts.createProgram([file('ui/button.ts')],opts,host);
const problems=ts.getPreEmitDiagnostics(program);
assert.equal(problems.length,0,ts.formatDiagnostics(problems,{getCanonicalFileName:x=>x,getCurrentDirectory:()=>root,getNewLine:()=> '\n'}));
class FakeText {constructor(text){this.text=text;this.visible=true;this.fontSize=50;this.scale=1;this.width=100;this.height=40;this.displayWidth=100;this.displayHeight=40;}setOrigin(){return this}setPosition(){return this}setDepth(){return this}setAlign(){return this}setMaxLines(){return this}setWordWrapWidth(){return this}setScale(scale){this.scale=scale;this.displayWidth=this.width*scale;this.displayHeight=this.height*scale;return this}setFontSize(size){this.fontSize=size;this.width=Math.max(...this.text.split('\n').map(x=>x.length))*size*.62;this.height=this.text.split('\n').length*size*1.1;this.displayWidth=this.width*this.scale;this.displayHeight=this.height*this.scale;return this}setTintFill(){return this}clearTint(){return this}}
class FakeMatter {constructor(_,x,y){this.x=x;this.y=y;this.displayWidth=400;this.displayHeight=200;this.tint=0xffffff;}setOrigin(){return this}getCenter(){return {x:this.x,y:this.y}}setSensor(){return this}setDepth(){return this}setTintFill(){return this}clearTint(){return this}on(){return this}off(){return this}setScale(x,y){this.displayWidth=400*x;this.displayHeight=200*y;return this}}
const compiled=ts.transpileModule(fs.readFileSync(file('ui/button.ts'),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2015,module:ts.ModuleKind.CommonJS}}).outputText;
const moduleExports={};
const fakeScene={matter:{world:{}},add:{existing(){},text(_x,_y,content){return new FakeText(content)}},sound:{add(){return {play(){}}}},hand:{removePinchCheck(){},addPinchCheck(){}}};
vm.runInNewContext(compiled,{exports:moduleExports,require:name=>{
 if(name==='../core/config')return {buttonDepth:10,buttonHoverTint:0xffffff,buttonPinchFinger:'index',buttonTextHoverTint:0xffffff,buttonTextStyle:{font:'50px Courier New'}};
 if(name==='../core/phaserTypes')return {MatterSprite:FakeMatter};
 if(name==='../managers/storageManager')return {config:{pinchVolume:1,uiPinchesEnabled:false}};
 if(name==='../util/interaction')return {default:()=>{}};
 if(name==='../study/runtime')return {getStudySession:()=>null};
 throw Error('Unexpected dependency '+name);
}}, {filename:'button.ts'});
const {Button}=moduleExports;
const primary=new Button(fakeScene,'CONTINUE',300,400,()=>{});
const large=primary.text.fontSize*primary.text.scale;
assert(large>60,`A real 400×200 button should retain readable text after adding padding (was ${large})`);
assert(primary.text.displayWidth<=primary.displayWidth*.86+.01,'Labels retain at least 7% padding on each horizontal side');
assert(primary.text.displayHeight<=primary.displayHeight*.80+.01,'Labels retain at least 10% padding on each vertical side');
primary.setScale(.45);
assert(primary.text.fontSize*primary.text.scale<large,'A smaller sprite must have a smaller *visually rendered* text label');
const utility=new Button(fakeScene,'SETUP\nCAMERA',300,400,()=>{});
assert(utility.text.fontSize*utility.text.scale>55);
utility.setScale(.45);
assert(utility.text.fontSize*utility.text.scale<50,'Compact utility buttons must fit their labels');
assert(fs.readFileSync(path.join(root, 'src/ts/scenes/levelUploadScene.ts'), 'utf8').includes('playButton.setScale(0.3)'), 'Level management buttons remain compact');
assert(!fs.readFileSync(path.join(root, 'src/ts/scenes/levelUploadScene.ts'), 'utf8').includes("text.setFont('25px Courier New')"), 'No level-management button should override its fitted font with fixed tiny text');
console.log('PASS: button class TS semantics and text sizing relative to sprite dimensions after scaling');
