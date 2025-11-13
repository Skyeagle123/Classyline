export function parseCSV(text){
  const lines=text.trim().split(/\r?\n/);
  const [header,...rows]=lines;
  const cols=header.split(',');
  return rows.filter(Boolean).map(r=>{
    const parts=[];let cur='',q=false;
    for(const ch of r){ if(ch==='"'){q=!q;continue} if(ch===','&&!q){parts.push(cur);cur='';} else cur+=ch; }
    parts.push(cur);
    const o={};
    cols.forEach((c,i)=>o[c.trim()]=(parts[i]||'').trim());
    o.price=Number(o.price||0);
    o.sizes=(o.sizes||'').split('|').filter(Boolean);
    o.rating=Number(o.rating||0);
    o.id=String(o.id||Math.random()).replace(/[^\w-]/g,'');
    return o;
  });
}

export async function loadProducts(){
  const override=localStorage.getItem('PRODUCTS_CSV_OVERRIDE');
  const txt=override||await (await fetch('/products.csv',{cache:'no-store'})).text();
  return parseCSV(txt);
}
