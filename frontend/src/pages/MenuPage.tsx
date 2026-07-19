import { Link } from "react-router-dom";
import { MENU } from "../data/menu";

export function MenuPage() {
  return (
    <section className="section">
      <div className="section-inner narrow">
        <p className="eyebrow">Straight from the fire</p>
        <h1 className="page-title">The board</h1>
        <p className="notice">
          Prices are a guide and move with the market. The kitchen confirms your total when you
          arrive. Weekends bring extras, so ask what else is on the fire.
        </p>

        {MENU.map((section) => (
          <div key={section.no} className="board-section">
            <h2 className="rule-head">
              <span className="head-no">{section.no}</span> {section.title}
            </h2>
            <ul className="board">
              {section.items.map((item) => (
                <li key={item.name} className="board-row">
                  <div className="board-name">
                    <h3>{item.name}</h3>
                    <p>{item.desc}</p>
                  </div>
                  <span className="board-dots" aria-hidden="true" />
                  <span className="board-price">{item.price}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}

        <p className="section-cta">
          <Link to="/reserve" className="btn btn-red btn-big">
            Book a table
          </Link>
        </p>
      </div>
    </section>
  );
}
