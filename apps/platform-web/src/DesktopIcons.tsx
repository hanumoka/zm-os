import { useEffect, useRef, useState, type ReactNode } from "react";
import type { SystemApp } from "./desktop-state";
import type { WorkspaceData } from "@zm/platform-contracts";
type Cell={column:number;row:number};
const size=104, margin=16;
function layout(apps:SystemApp[],saved:WorkspaceData["positions"],width:number,height:number):Record<string,Cell> {
  const rows=Math.max(1,Math.floor((height-margin*2)/size)),cols=Math.max(1,Math.floor((width-margin*2)/size));
  const used=new Set<string>(),result:Record<string,Cell>={};
  for(const id of apps) {
    const c=saved[id];
    if(c && c.column<cols && c.row<rows && !used.has(c.column+":"+c.row)){result[id]=c;used.add(c.column+":"+c.row);}
  }
  for(const id of apps)if(!result[id]){
    let i=0;while(used.has(Math.floor(i/rows)+":"+(i%rows)))i++;
    const c={column:Math.floor(i/rows),row:i%rows};result[id]=c;used.add(c.column+":"+c.row);
  }
  return result;
}
interface Props {
  apps:SystemApp[];width:number;height:number;ready:boolean;
  preferences:WorkspaceData;editable:boolean;onChange:(update:(current:WorkspaceData)=>WorkspaceData)=>void;
  title:(id:SystemApp)=>string;icon:(id:SystemApp)=>ReactNode;onOpen:(id:SystemApp)=>void;
  onShowDesktop:()=>void;
}
export function DesktopIcons({apps,width,height,ready,preferences,editable,onChange,title,icon,onOpen,onShowDesktop}:Props):React.JSX.Element {
  const [selected,setSelected]=useState<SystemApp[]>([]);
  const [menu,setMenu]=useState<{x:number;y:number;app?:SystemApp}|null>(null);
  const [drag,setDrag]=useState<{id:SystemApp;x:number;y:number}|null>(null);
  const root=useRef<HTMLElement>(null),context=useRef<HTMLElement>(null),dragging=useRef<(()=>void)|null>(null),suppress=useRef(false);
  const positions=layout(apps,preferences.positions,width,height);
  useEffect(()=>()=>dragging.current?.(),[]);
  useEffect(()=>{
    if(!menu)return;context.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const close=(e:KeyboardEvent):void=>{if(e.key==="Escape"){setMenu(null);root.current?.querySelector<HTMLButtonElement>('[aria-pressed="true"]')?.focus();}};
    window.addEventListener("keydown",close);return()=>window.removeEventListener("keydown",close);
  },[menu]);
  const save=(update:(current:WorkspaceData)=>WorkspaceData):void=>{if(editable)onChange(update);};
  const move=(id:SystemApp,column:number,row:number):void=>{
    const rows=Math.max(1,Math.floor((height-margin*2)/size)),cols=Math.max(1,Math.floor((width-margin*2)/size));
    const target={column:Math.max(0,Math.min(cols-1,column)),row:Math.max(0,Math.min(rows-1,row))};
    save(current=>{
      const currentPositions=layout(apps,current.positions,width,height);
      const occupied=apps.find(other=>other!==id && currentPositions[other]?.column===target.column && currentPositions[other]?.row===target.row);
      const next={...current.positions,...currentPositions,[id]:target};if(occupied)next[occupied]=currentPositions[id]!;
      return {...current,positions:next};
    });
  };
  const select=(id:SystemApp,extend:boolean):void=>setSelected(previous=>extend ? previous.includes(id) ? previous.filter(item=>item!==id) : [...previous,id] : [id]);
  const pointer=(event:React.PointerEvent<HTMLButtonElement>,id:SystemApp):void=>{
    if(event.button!==0 || !ready || !editable)return;dragging.current?.();suppress.current=false;
    const element=event.currentTarget,startX=event.clientX,startY=event.clientY,initial=positions[id]!;
    let moved=false,currentX=startX,currentY=startY;element.setPointerCapture(event.pointerId);
    const moving=(next:PointerEvent):void=>{
      currentX=next.clientX;currentY=next.clientY;if(Math.hypot(currentX-startX,currentY-startY)>6)moved=true;
      if(moved){setSelected([id]);setMenu(null);setDrag({id,x:margin+initial.column*size+currentX-startX,y:margin+initial.row*size+currentY-startY});}
    };
    const cleanup=():void=>{
      element.removeEventListener("pointermove",moving);element.removeEventListener("pointerup",finish);
      element.removeEventListener("pointercancel",cancel);element.removeEventListener("lostpointercapture",cancel);
      dragging.current=null;setDrag(null);
    };
    const cancel=():void=>{suppress.current=moved;cleanup();};
    const finish=():void=>{
      suppress.current=moved;if(moved)move(id,Math.round(initial.column+(currentX-startX)/size),Math.round(initial.row+(currentY-startY)/size));cleanup();
    };
    dragging.current=cancel;element.addEventListener("pointermove",moving);element.addEventListener("pointerup",finish);
    element.addEventListener("pointercancel",cancel);element.addEventListener("lostpointercapture",cancel);
  };
  const keyboard=(event:React.KeyboardEvent,id:SystemApp):void=>{
    const d=({ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]} as Record<string,number[]>)[event.key];
    if(d){
      event.preventDefault();const origin=positions[id]!;
      if(event.altKey)move(id,origin.column+d[0]!,origin.row+d[1]!);
      else{
        const next=apps.filter(other=>other!==id).map(other=>({id:other,c:positions[other]!}))
          .filter(({c})=>d[0] ? (c.column-origin.column)*d[0]!>0 : (c.row-origin.row)*d[1]!>0)
          .sort((a,b)=>(Math.abs(a.c.column-origin.column)+Math.abs(a.c.row-origin.row))-(Math.abs(b.c.column-origin.column)+Math.abs(b.c.row-origin.row)))[0]?.id;
        if(next){select(next,event.shiftKey);root.current?.querySelector<HTMLButtonElement>('[data-icon="'+next+'"]')?.focus();}
      }
    }else if(event.key==="Enter"){event.preventDefault();onOpen(id);}
    else if(event.key==="Escape"){setSelected([]);setMenu(null);}
    else if(event.key.toLowerCase()==="a" && (event.ctrlKey || event.metaKey)){event.preventDefault();setSelected(apps);}
    else if(event.key==="F10" && event.shiftKey){event.preventDefault();setMenu({x:margin+positions[id]!.column*size,y:margin+positions[id]!.row*size,app:id});}
  };
  const contextMenu=(event:React.MouseEvent,app?:SystemApp):void=>{
    event.preventDefault();event.stopPropagation();if(app)setSelected([app]);
    const box=root.current?.getBoundingClientRect();setMenu({x:event.clientX-(box?.x ?? 0),y:event.clientY-(box?.y ?? 0),app});
  };
  const sort=():void=>{
    const rows=Math.max(1,Math.floor((height-margin*2)/size)),sorted=[...apps].sort((a,b)=>title(a).localeCompare(title(b),"ko"));
    save(current=>({...current,positions:Object.fromEntries(sorted.map((id,i)=>[id,{column:Math.floor(i/rows),row:i%rows}]))}));setMenu(null);
  };
  return <>
    <nav ref={root} className="os-desktop-icons os-arrangeable" aria-label="시스템 앱" onContextMenu={event=>contextMenu(event)} onClick={event=>{if(event.target===event.currentTarget){setSelected([]);setMenu(null);}}} aria-describedby="desktop-icon-help">
      <span className="sr-only" id="desktop-icon-help">두 번 클릭하거나 Enter로 엽니다. 방향키로 선택하고 Alt와 방향키로 옮깁니다. 우클릭 또는 Shift와 F10으로 메뉴를 엽니다.</span>
      {apps.map(id=><button key={id} data-icon={id} className={"os-desktop-icon"+(selected.includes(id) ? " is-selected" : "")+(drag?.id===id ? " is-dragging" : "")}
        style={{left:drag?.id===id ? drag.x : margin+positions[id]!.column*size,top:drag?.id===id ? drag.y : margin+positions[id]!.row*size}}
        disabled={!ready} aria-label={title(id)+" 열기"} aria-pressed={selected.includes(id)} title={title(id)+" · 더블클릭 또는 Enter"}
        onPointerDown={event=>pointer(event,id)} onClick={event=>{if(suppress.current){suppress.current=false;return;}select(id,event.ctrlKey || event.metaKey);setMenu(null);}}
        onDoubleClick={()=>{if(!suppress.current)onOpen(id);}} onKeyDown={event=>keyboard(event,id)} onContextMenu={event=>contextMenu(event,id)}>
        {icon(id)}<span>{title(id)}</span>
      </button>)}
    </nav>
    {menu && <>
      <div className="os-context-scrim" onPointerDown={()=>setMenu(null)} onContextMenu={event=>{event.preventDefault();setMenu(null);}}/>
      <nav ref={context} className="os-context-menu" aria-label="바탕화면 메뉴" style={{left:Math.max(4,Math.min(menu.x,width-244)),top:Math.max(4,Math.min(menu.y,height-360))}}>
        {menu.app && <button onClick={()=>{onOpen(menu.app!);setMenu(null);}}>{title(menu.app)} 열기</button>}
        <button disabled={!editable} onClick={sort}>아이콘 이름순 정렬</button>
        <button disabled={!editable} onClick={()=>{save(current=>({...current,positions:{}}));setMenu(null);}}>아이콘 배치 초기화</button>
        <button onClick={()=>{onShowDesktop();setMenu(null);}}>모든 창 최소화</button>
        <hr/><p>바탕화면 배경</p>
        {(["sky","sand","night"] as const).map((value,index)=><button disabled={!editable} key={value} aria-pressed={preferences.wallpaper===value} onClick={()=>{save(current=>({...current,wallpaper:value}));setMenu(null);}}>
          <span className={"os-wallpaper-swatch "+value}/>{["하늘","모래","밤"][index]}{preferences.wallpaper===value ? " ✓" : ""}
        </button>)}
        <button onClick={()=>{onOpen("workspace");setMenu(null);}}>작업공간 설정과 창 복원</button>
      </nav>
    </>}
  </>;
}
