import {Group, Rect, Circle, Path, Polygon, Line} from 'fabric';

const names={'⭐':'Star','✅':'Check','💡':'Idea','🎯':'Target','👏':'Applause','❓':'Question'};
const path=(d,fill,stroke)=>new Path(d,{fill,stroke,strokeWidth:8,strokeLineCap:'round',strokeLineJoin:'round',objectCaching:false});
export function createSticker(symbol) {
  let objects=[];
  if(symbol==='⭐')objects=[new Polygon(Array.from({length:10},(_,i)=>{const angle=i*Math.PI/5-Math.PI/2,r=i%2?42:94;return {x:100+Math.cos(angle)*r,y:100+Math.sin(angle)*r};}),{fill:'#f5c84c',stroke:'#bc8b20',strokeWidth:5})];
  if(symbol==='✅')objects=[new Rect({width:200,height:200,rx:36,ry:36,fill:'#46a45a'}),path('M 43 104 L 82 145 L 158 58','transparent','#fff')];
  if(symbol==='💡')objects=[new Circle({left:40,top:25,radius:60,fill:'#f5d86b',stroke:'#c1942e',strokeWidth:5}),new Rect({left:74,top:140,width:52,height:36,rx:6,ry:6,fill:'#6a7974'}),path('M 83 150 L 83 113 L 69 96 M 117 150 L 117 113 L 131 96','transparent','#a77c1d'),...[[100,0,100,13],[14,40,27,50],[173,50,186,40],[8,100,24,100],[176,100,192,100]].map(points=>new Line(points,{stroke:'#c1942e',strokeWidth:7,strokeLineCap:'round'}))];
  if(symbol==='🎯')objects=[...[[0,100,'#d95753'],[25,75,'#fff'],[50,50,'#d95753'],[75,25,'#fff']].map(([left,radius,fill])=>new Circle({left,top:left,radius,fill})),path('M 100 100 L 188 12','transparent','#244d40'),new Polygon([{x:160,y:0},{x:200,y:0},{x:200,y:40}],{fill:'#244d40'})];
  if(symbol==='👏')objects=[path('M 37 169 L 13 125 Q 7 110 20 106 L 46 137 L 18 57 Q 16 45 29 44 L 63 114 L 44 29 Q 45 17 58 21 L 80 107 L 74 20 Q 78 10 89 18 L 99 106 L 109 42 Q 119 30 126 44 L 119 121 L 137 100 Q 150 91 157 105 L 128 167 Q 118 188 86 190 L 61 190 Z','#efd0a2','#bd8b56'),path('M 117 165 L 155 112 Q 163 104 173 113 L 159 145 L 181 119 Q 192 114 197 124 L 168 173 Q 154 193 127 194','#f7dcaf','#bd8b56'),path('M 156 61 L 174 46 M 137 44 L 143 21 M 173 82 L 194 78','transparent','#d49c2b')];
  if(symbol==='❓')objects=[new Circle({radius:100,fill:'#d95753'}),path('M 69 67 C 69 25 142 26 140 68 C 138 89 99 89 99 119','transparent','#fff'),new Circle({left:91,top:140,radius:9,fill:'#fff'})];
  if(!objects.length)return null;
  const group=new Group(objects,{left:220,top:180,objectCaching:false,lpLabel:`${names[symbol]} sticker`,lpSticker:symbol});
  group.set({scaleX:160/group.width,scaleY:160/group.height});
  return group;
}

export function upgradeStickers(scene,properties=[]) {
  const convert=objects=>objects.map(object=>{
    if(object.objects)object.objects=convert(object.objects);
    if(object.type?.toLowerCase()!=='textbox'||object.lpLabel!=='Sticker')return object;
    const sticker=createSticker(object.text);if(!sticker)return object;
    sticker.set({left:object.left,top:object.top,angle:object.angle||0,scaleX:(object.width||160)*(object.scaleX??1)/sticker.width,scaleY:(object.height||160)*(object.scaleY??1)/sticker.height,flipX:!!object.flipX,flipY:!!object.flipY,lpId:object.lpId});
    return sticker.toObject(properties);
  });
  scene.objects=convert(scene.objects||[]);return scene;
}
