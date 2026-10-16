import {describe,it,expect,vi} from 'vitest';
import {drawVGauge,drawHBar,drawHint} from '../src/ui/gauge.js';

function mockContext(){
  const ctx={};
  for(const name of ['save','restore','beginPath','roundRect','fill','stroke','fillRect','strokeRect','setLineDash','moveTo','lineTo','arc','fillText','strokeText'])ctx[name]=vi.fn();
  ctx.createLinearGradient=vi.fn(()=>({addColorStop:vi.fn()}));
  return ctx;
}
const vertical={x:200,top:90,h:150,value:.45,band:[.3,.6],limit:.8,title:'누르는 힘'};
const horizontal={bx:200,by:300,bw:160,off:.3,title:'손 위치'};

describe('shared clinic gauges',()=>{
  it.each([0,.5,1])('uses bands without percentage labels at value %s',value=>{
    const ctx=mockContext();
    drawVGauge(ctx,{...vertical,value});drawHBar(ctx,horizontal);
    expect(ctx.fillText.mock.calls.length).toBeGreaterThan(0);
    for(const text of [...ctx.fillText.mock.calls,...ctx.strokeText.mock.calls].map(call=>call[0]))expect(text).not.toContain('%');
    expect(ctx.fillText.mock.calls.map(call=>call[0])).toContain('과해요');
  });
  it('shows the target band by default',()=>{
    const ctx=mockContext();drawHBar(ctx,horizontal);
    expect(ctx.fillRect).toHaveBeenCalledOnce();expect(ctx.strokeRect).toHaveBeenCalledOnce();
  });
  it('hides both the band fill and outline when the target is concealed',()=>{
    const ctx=mockContext();drawHBar(ctx,{...horizontal,showBand:false});
    expect(ctx.fillRect).not.toHaveBeenCalled();expect(ctx.strokeRect).not.toHaveBeenCalled();
    expect(ctx.arc).toHaveBeenCalled();expect(ctx.fillText).toHaveBeenCalled();
  });
  it('draws a supplied hint without a percentage label',()=>{
    const ctx=mockContext();drawHint(ctx,{x:200,y:250,text:'지금 툭',hot:true});
    expect(ctx.fillText).toHaveBeenCalledWith('지금 툭',200,250);
    expect(ctx.save).toHaveBeenCalledOnce();expect(ctx.restore).toHaveBeenCalledOnce();
  });
});
