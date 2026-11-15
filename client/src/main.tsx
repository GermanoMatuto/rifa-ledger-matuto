import {createRoot} from 'react-dom/client';
import {Route,Switch} from 'wouter';
import RifaLedger from './pages/RifaLedger';
import CheckoutPage from './pages/CheckoutPage';
import { lazy, Suspense } from 'react';
const AdminPaymentsPage = lazy(()=>import('./pages/AdminPaymentsPage'));
import './reset.css';
createRoot(document.getElementById('root')!).render(<Switch><Route path="/admin/pagamentos"><Suspense fallback={<p>Carregando painel…</p>}><AdminPaymentsPage/></Suspense></Route><Route path="/checkout"><CheckoutPage/></Route><Route path="/meus-pedidos"><CheckoutPage tracking/></Route><Route><RifaLedger/></Route></Switch>);
