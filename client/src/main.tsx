import {createRoot} from 'react-dom/client';
import {Route,Switch} from 'wouter';
import RifaLedger from './pages/RifaLedger';
import CheckoutPage from './pages/CheckoutPage';
import './reset.css';
createRoot(document.getElementById('root')!).render(<Switch><Route path="/checkout"><CheckoutPage/></Route><Route path="/meus-pedidos"><CheckoutPage tracking/></Route><Route><RifaLedger/></Route></Switch>);
