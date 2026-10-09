(() => {
  const canvas = document.querySelector('#crop-canvas'), ctx = canvas.getContext('2d');
  let source, original, selection, down, frame;
  const release=c=>{if(c){c.width=c.height=1;}};
  const draw = () => { cancelAnimationFrame(frame);frame=null;if(!source)return;if(canvas.width!==source.width)canvas.width=source.width;if(canvas.height!==source.height)canvas.height=source.height;ctx.clearRect(0,0,canvas.width,canvas.height);ctx.drawImage(source,0,0);if(selection){const {x,y,width,height}=selection;ctx.fillStyle='#263c3340';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(source,x,y,width,height,x,y,width,height);ctx.strokeStyle='#66834f';ctx.lineWidth=Math.max(2,canvas.width/250);ctx.strokeRect(x,y,width,height);} };
  const point = e => {const b=canvas.getBoundingClientRect();return {x:Math.max(0,Math.min(canvas.width,(e.clientX-b.x)*canvas.width/b.width)),y:Math.max(0,Math.min(canvas.height,(e.clientY-b.y)*canvas.height/b.height))};};
  canvas.onpointerdown=e=>{down=point(e);canvas.setPointerCapture(e.pointerId);};
  canvas.onpointermove=e=>{if(!down)return;const p=point(e);selection={x:Math.round(Math.min(down.x,p.x)),y:Math.round(Math.min(down.y,p.y)),width:Math.round(Math.abs(p.x-down.x)),height:Math.round(Math.abs(p.y-down.y))};if(!frame)frame=requestAnimationFrame(draw);};
  canvas.onpointerup=()=>{down=null;draw();};canvas.onpointercancel=()=>{down=null;selection=null;draw();};
  const make=(w,h)=>{const c=document.createElement('canvas');c.width=w;c.height=h;return c;};
  window.ImageEditor={
    async load(data){const image=new Image();image.src=data;await image.decode();if(image.naturalWidth*image.naturalHeight>50000000)throw Error('图片像素过大，请先缩小到 5000 万像素以内');const scale=Math.min(1,2400/Math.max(image.width,image.height)),next=make(Math.max(1,Math.round(image.width*scale)),Math.max(1,Math.round(image.height*scale)));next.getContext('2d').fillStyle='#fff';next.getContext('2d').fillRect(0,0,next.width,next.height);next.getContext('2d').drawImage(image,0,0,next.width,next.height);if(source!==original)release(source);release(original);source=original=next;image.src='';selection=null;document.querySelector('#image-editor').hidden=false;draw();},
    data(){return source?.toDataURL('image/jpeg',.92);},
    rotate(){if(!source)return;const next=make(source.height,source.width),c=next.getContext('2d');c.translate(next.width,0);c.rotate(Math.PI/2);c.drawImage(source,0,0);if(source!==original)release(source);source=next;selection=null;draw();},
    crop(){if(!selection||selection.width<8||selection.height<8)throw Error('请先拖动框选至少 8 × 8 像素的区域');const next=make(selection.width,selection.height);next.getContext('2d').drawImage(source,selection.x,selection.y,selection.width,selection.height,0,0,next.width,next.height);if(source!==original)release(source);source=next;selection=null;draw();},
    reset(){if(!original)return;if(source!==original)release(source);source=original;selection=null;draw();}
  };
})();
