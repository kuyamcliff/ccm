import { Route, Routes } from "react-router-dom";
import { Header } from "./components/Header";
import { Footer } from "./components/Footer";
import { Home } from "./pages/Home";
import { MenuPage } from "./pages/MenuPage";
import { Reserve } from "./pages/Reserve";
import { Reviews } from "./pages/Reviews";
import { Login } from "./pages/Login";
import { Register } from "./pages/Register";
import { Account } from "./pages/Account";
import { NotFound } from "./pages/NotFound";

export default function App() {
  return (
    <div className="page">
      <p className="ticker" aria-hidden="true">
        buea · clerks quarters · opposite the survey school · open daily, midday till late
      </p>
      <Header />
      <main>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/menu" element={<MenuPage />} />
          <Route path="/reserve" element={<Reserve />} />
          <Route path="/reviews" element={<Reviews />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/account" element={<Account />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
      <Footer />
    </div>
  );
}
