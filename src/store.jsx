import React from 'react';

const Ctx = React.createContext(null);

function reducer(state, action){
  switch(action.type){
    case 'INIT':
      return action.payload;
    case 'ADD': {
      const {id, size, title, price} = action.payload;
      const next = [...state];
      const i = next.findIndex(x => x.id===id && x.size===size);
      if (i >= 0) next[i].qty += 1;
      else next.push({id, size, title, price, qty:1});
      return next;
    }
    case 'REMOVE': {
      const {id, size} = action.payload;
      return state.filter(x => !(x.id===id && x.size===size));
    }
    case 'CLEAR':
      return [];
    default:
      return state;
  }
}

export function CartProvider({children}){
  const [cart, dispatch] = React.useReducer(reducer, []);

  React.useEffect(()=>{
    try {
      const raw = localStorage.getItem('CART_V2');
      if (raw) dispatch({type:'INIT', payload: JSON.parse(raw)});
    } catch {}
  }, []);

  React.useEffect(()=>{
    localStorage.setItem('CART_V2', JSON.stringify(cart));
  }, [cart]);

  const add    = (item)=>dispatch({type:'ADD', payload:item});
  const remove = (id,size)=>dispatch({type:'REMOVE', payload:{id,size}});
  const clear  = ()=>dispatch({type:'CLEAR'});

  const count = cart.reduce((s,x)=>s+x.qty,0);
  const subtotal = cart.reduce((s,x)=>s+x.qty*x.price,0);

  return <Ctx.Provider value={{cart, add, remove, clear, count, subtotal}}>{children}</Ctx.Provider>;
}

export function useCart(){
  const ctx = React.useContext(Ctx);
  if (!ctx) throw new Error('useCart must be used inside <CartProvider>');
  return ctx;
}
