import { api } from "~/lib/api";
import { useQuery } from "~/lib/store";
import { K } from "~/lib/keys";
import { LinkButton } from "~/ui/Button";
import { Meter } from "~/ui/Bits";
import { DeskPage, Loaded, Nothing, State, TableWrap } from "./parts";

/**
 * What of the owner's own wording is still only in English.
 *
 * The application's own text ships in both languages and is checked at build
 * time, so it is never listed here. What this covers is everything typed into
 * the console: the closed sign, the announcement bar, the legal pages, the
 * service messages. Those live in the database and nothing can check them but a
 * person.
 *
 * Read-only on purpose. Each row says which screen the wording is changed on and
 * links there, rather than offering a second place to edit the same field, which
 * is how two versions of one sentence come to exist.
 */

const STATUS: Record<string, { tone: "bad" | "warn" | "good"; word: string }> = {
  missing: { tone: "bad", word: "Empty" },
  copied: { tone: "warn", word: "Still English" },
  done: { tone: "good", word: "Done" },
};

/** Where each kind of wording is actually edited. */
const WHERE_TO: Record<string, string> = {
  "Site control": "/desk/site-control",
  "Terms and privacy": "/desk/legal",
  Details: "/desk/settings",
  Offers: "/desk/offers",
};

export function Translations() {
  const report = useQuery(K.desk.translations, () => api.desk.translations(), { staleMs: 60_000 });

  return (
    <DeskPage title="Translations" hint="Your own wording that has not been put into French yet.">
      <Loaded query={report}>
        {(data) => (
          <>
            <div className="dk-progress">
              <div className="bar bar--between">
                <span className="label">Translated</span>
                <span className="strong">
                  {data.done} of {data.total}
                </span>
              </div>
              <Meter
                value={data.done}
                max={Math.max(1, data.total)}
                label="Translation progress"
                tone={data.done === data.total ? "good" : "hot"}
              />
            </div>

            {data.outstanding.length === 0 ? (
              <Nothing>Everything you have typed exists in both languages.</Nothing>
            ) : (
              <TableWrap label="Untranslated wording">
                <thead>
                  <tr>
                    <th>What</th>
                    <th>English</th>
                    <th>State</th>
                    <th aria-label="Where to change it" />
                  </tr>
                </thead>
                <tbody>
                  {data.outstanding.map((entry) => {
                    const status = STATUS[entry.status] ?? STATUS.missing!;
                    const to = WHERE_TO[entry.where];
                    return (
                      <tr key={entry.id}>
                        <td>
                          <span className="dk-cell">
                            <span>{entry.label}</span>
                            <span className="fine faint">{entry.where}</span>
                          </span>
                        </td>
                        <td className="dk-wrapcell fine">{entry.english || <span className="faint">Empty</span>}</td>
                        <td>
                          <State tone={status.tone}>{status.word}</State>
                        </td>
                        <td>
                          {to ? (
                            <LinkButton to={to} size="sm" tone="ghost" iconEnd="arrow-right">
                              Change it
                            </LinkButton>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </TableWrap>
            )}
          </>
        )}
      </Loaded>
    </DeskPage>
  );
}
