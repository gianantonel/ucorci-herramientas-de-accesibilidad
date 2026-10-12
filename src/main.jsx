import React, { useState, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import { extractText, plainText, download, mp3ToWav } from "./files";
import "./style.css";

const TOOLS = [
  {
    id: "tts",
    number: "01",
    title: "Texto a voz",
    description:
      "Escribí o cargá un documento. Escuchalo y descargá el audio en MP3 o WAV.",
    tags: "voz audio tts pdf word excel leer mp3 wav",
  },
  {
    id: "stt",
    number: "02",
    title: "Audio a texto",
    description:
      "Convertí una grabación en texto plano, sin emojis ni símbolos decorativos.",
    tags: "transcripción transcripcion stt whisper audio texto",
  },
  {
    id: "dyslexia",
    number: "03",
    title: "Lectura para dislexia",
    description:
      "Adaptá la fuente, el tamaño y el espaciado de cualquier texto a tu forma de leer.",
    tags: "dislexia comic sans lectura fuente adaptar",
  },
];
const safeGet = (key, fallback) => {
  try {
    return localStorage.getItem(key) || fallback;
  } catch {
    return fallback;
  }
};
const save = (key, value) => {
  try {
    localStorage.setItem(key, value);
  } catch {}
};
async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: "same-origin",
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
  });
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error("El servicio no respondió. Intentá nuevamente.");
  }
  if (!response.ok)
    throw new Error(data.error || "No pudimos completar la operación.");
  return data;
}
async function signIn(provider, values = {}) {
  const { csrfToken } = await api("/api/auth/csrf");
  const body = new URLSearchParams({
    csrfToken,
    callbackUrl: window.location.origin,
    ...values,
  });
  const response = await fetch(
    "/api/auth/" +
      (provider === "credentials" ? "callback/" : "signin/") +
      provider,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "X-Auth-Return-Redirect": "1",
      },
      body,
    },
  );
  const data = await response.json();
  if (data.url?.includes("error="))
    throw new Error(
      "No pudimos iniciar sesión. Revisá tu correo y contraseña.",
    );
  return data;
}

function App() {
  const [page, setPage] = useState(
    TOOLS.some((t) => t.id === location.hash.slice(1))
      ? location.hash.slice(1)
      : "home",
  );
  const [theme, setTheme] = useState(safeGet("ucorci-theme", "dark")),
    [font, setFont] = useState(safeGet("ucorci-font", "standard")),
    [size, setSize] = useState(safeGet("ucorci-size", "100"));
  const [search, setSearch] = useState(""),
    [user, setUser] = useState(null),
    [authLoading, setAuthLoading] = useState(true),
    [health, setHealth] = useState(null);
  const [authMode, setAuthMode] = useState("register"),
    [accountError, setAccountError] = useState(""),
    [accountBusy, setAccountBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [metricError, setMetricError] = useState("");
  const dialog = useRef(),
    heading = useRef(),
    returnFocus = useRef();
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    save("ucorci-theme", theme);
  }, [theme]);
  useEffect(() => {
    document.documentElement.dataset.font = font;
    save("ucorci-font", font);
  }, [font]);
  useEffect(() => {
    document.documentElement.style.fontSize = size + "%";
    save("ucorci-size", size);
  }, [size]);
  const refreshUser = async () => {
    try {
      const data = await api("/api/me");
      setUser(data.user);
    } catch {
      setUser(null);
    } finally {
      setAuthLoading(false);
    }
  };
  useEffect(() => {
    refreshUser();
    api("/api/health")
      .then(setHealth)
      .catch(() => {});
    if (new URLSearchParams(location.search).has("account")) {
      setAuthMode(
        new URLSearchParams(location.search).get("account") === "profile"
          ? "profile"
          : "login",
      );
      setTimeout(() => dialog.current?.showModal(), 0);
    }
    return () => window.speechSynthesis?.cancel();
  }, []);
  useEffect(() => {
    const change = () =>
      setPage(
        TOOLS.some((t) => t.id === location.hash.slice(1))
          ? location.hash.slice(1)
          : "home",
      );
    window.addEventListener("hashchange", change);
    return () => window.removeEventListener("hashchange", change);
  }, []);
  function navigate(id) {
    window.speechSynthesis?.cancel();
    setPage(id);
    location.hash = id === "home" ? "herramientas" : id;
    setTimeout(() => heading.current?.focus(), 0);
  }
  function openAccount(mode = "register") {
    returnFocus.current = document.activeElement;
    setAuthMode(mode);
    setAccountError("");
    dialog.current.showModal();
  }
  function closeAccount() {
    dialog.current.close();
    const url = new URL(location.href);
    url.searchParams.delete("account");
    url.searchParams.delete("error");
    history.replaceState({}, "", url.pathname + url.search + url.hash);
    returnFocus.current?.focus();
  }
  function requireUser() {
    if (authLoading) {
      setNotice(
        "Estamos verificando tu sesión. Intentá nuevamente en un momento.",
      );
      return false;
    }
    if (!user) {
      openAccount("register");
      return false;
    }
    if (!user.firstName || !user.lastName) {
      openAccount("profile");
      return false;
    }
    return true;
  }
  async function metric(tool, start, result = "success") {
    try {
      await api("/api/events", {
        method: "POST",
        body: JSON.stringify({
          tool,
          durationMs: Math.min(
            86400000,
            Math.max(0, performance.now() - start),
          ),
          result,
        }),
      });
      setMetricError("");
    } catch {
      setMetricError(
        "La herramienta terminó, pero no pudimos guardar la métrica de uso.",
      );
    }
  }
  async function submitAccount(event) {
    event.preventDefault();
    setAccountBusy(true);
    setAccountError("");
    const values = Object.fromEntries(new FormData(event.currentTarget));
    try {
      if (authMode === "register") {
        await api("/api/register", {
          method: "POST",
          body: JSON.stringify({ ...values, consent: values.consent === "on" }),
        });
        await signIn("credentials", {
          email: values.email,
          password: values.password,
        });
      } else if (authMode === "profile")
        await api("/api/profile", {
          method: "POST",
          body: JSON.stringify(values),
        });
      else
        await signIn("credentials", {
          email: values.email,
          password: values.password,
        });
      await refreshUser();
      closeAccount();
      setNotice(
        authMode === "profile"
          ? "Tus datos fueron guardados."
          : "Sesión iniciada. Ya podés usar las herramientas.",
      );
    } catch (error) {
      setAccountError(error.message);
    } finally {
      setAccountBusy(false);
    }
  }
  async function logout() {
    try {
      const { csrfToken } = await api("/api/auth/csrf");
      await fetch("/api/auth/signout", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "X-Auth-Return-Redirect": "1",
        },
        body: new URLSearchParams({ csrfToken, callbackUrl: location.origin }),
      });
      setUser(null);
      setNotice("Sesión cerrada.");
      closeAccount();
    } catch (error) {
      setAccountError(error.message);
    }
  }
  const tool = TOOLS.find((t) => t.id === page);
  const results = TOOLS.filter((t) =>
    (t.title + " " + t.description + " " + t.tags)
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase()
      .includes(
        search
          .normalize("NFD")
          .replace(/\p{Diacritic}/gu, "")
          .toLowerCase(),
      ),
  );
  return (
    <>
      <a className="skip" href="#contenido">
        Saltar al contenido principal
      </a>
      <header className="header">
        <a
          className="brand"
          href="#herramientas"
          onClick={() => navigate("home")}
          aria-label="UCORCI, Unión Cordobesa de Ciegos. Inicio"
        >
          <img
            className="brand-logo"
            src="/logo-ucorci.png"
            alt=""
            width="80"
            height="80"
          />
          <span className="brand-text">
            <strong>UCORCI</strong>
            <span className="brand-subtitle">Unión Cordobesa de Ciegos</span>
          </span>
        </a>
        <div
          className="preferences"
          role="group"
          aria-label="Preferencias de accesibilidad"
        >
          <Preference
            id="contrast"
            label="Contraste"
            value={theme}
            onChange={setTheme}
            options={[
              ["dark", "Oscuro"],
              ["light", "Claro"],
              ["yellow", "Amarillo sobre negro"],
            ]}
          />
          <Preference
            id="font"
            label="Fuente"
            value={font}
            onChange={setFont}
            options={[
              ["standard", "Estándar"],
              ["dyslexia", "Comic Sans"],
            ]}
          />
          <Preference
            id="size"
            label="Texto"
            value={size}
            onChange={setSize}
            options={[
              ["100", "100 %"],
              ["125", "125 %"],
              ["150", "150 %"],
              ["200", "200 %"],
            ]}
          />
        </div>
      </header>
      <nav className="topnav" aria-label="Navegación principal">
        <a
          href="#herramientas"
          aria-current={page === "home" ? "page" : undefined}
          onClick={() => navigate("home")}
        >
          Herramientas
        </a>
        <a href="#acerca">Acerca de UCORCI</a>
        <button
          className="account-link"
          onClick={() => openAccount(user ? "account" : "register")}
        >
          {authLoading
            ? "Verificando sesión"
            : user
              ? "Mi cuenta"
              : "Registrarse gratis"}
        </button>
      </nav>
      <main id="contenido" tabIndex="-1">
        <div className="status" role="status" aria-live="polite">
          {notice}
        </div>
        {metricError && <p role="status">{metricError}</p>}
        {page === "home" ? (
          <>
            <section className="intro">
              <p className="eyebrow">DE CÓRDOBA, ARGENTINA, PARA EL MUNDO</p>
              <h1 ref={heading} tabIndex="-1">
                UCORCI Herramientas
                <br className="desktop-break" /> de Accesibilidad
              </h1>
              <p className="lead">
                Más formas de escuchar, escribir y leer.
                <br />
                Herramientas gratuitas para una vida más accesible.
              </p>
              <p className="intro-note">
                Para personas ciegas, con baja visión y para quienes necesitan
                otra forma de acceder a la información.
              </p>
              <a className="primary" href="#indice">
                Explorar las herramientas
              </a>
              <span className="free-note">Sin costo. Sin suscripciones.</span>
            </section>
            <section id="indice" aria-labelledby="index-title">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">ELEGÍ LO QUE NECESITÁS</p>
                  <h2 id="index-title">Tus herramientas</h2>
                </div>
                <p>3 herramientas gratuitas</p>
              </div>
              <div className="search">
                <label htmlFor="search">Buscar una herramienta</label>
                <input
                  id="search"
                  type="search"
                  placeholder="Por ejemplo: voz, PDF o dislexia"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <p role="status" className="search-count">
                  {search
                    ? `${results.length} ${results.length === 1 ? "herramienta encontrada" : "herramientas encontradas"}`
                    : "Todas las herramientas, en un solo lugar."}
                </p>
              </div>
              <div className="tool-grid">
                {results.map((t) => (
                  <article className="tool-card" key={t.id}>
                    <span className="tool-number" aria-hidden="true">
                      {t.number}
                    </span>
                    <p className="tag">Gratis</p>
                    <h3>
                      <a href={"#" + t.id} onClick={() => navigate(t.id)}>
                        {t.title}
                      </a>
                    </h3>
                    <p>{t.description}</p>
                    <a
                      className="tool-action"
                      href={"#" + t.id}
                      onClick={() => navigate(t.id)}
                      aria-label={"Abrir " + t.title}
                    >
                      Abrir herramienta
                    </a>
                  </article>
                ))}
              </div>
              {!results.length && (
                <p>
                  No encontramos herramientas con ese término. Probá con «voz»,
                  «texto» o «lectura».
                </p>
              )}
            </section>
            <section
              className="accessibility-note"
              aria-labelledby="access-title"
            >
              <h2 id="access-title">A tu manera, desde el primer momento.</h2>
              <p>
                Usá el teclado o tu lector de pantalla. Elegí el contraste,
                aumentá el texto o cambiá la fuente desde los controles de
                arriba. Tus preferencias se recuerdan en este dispositivo.
              </p>
              <p>
                Preparada con controles nativos y etiquetas para NVDA, JAWS,
                TalkBack y VoiceOver. Las pruebas con cada lector se detallan en
                la declaración de accesibilidad.
              </p>
            </section>
          </>
        ) : (
          <section className="workspace" aria-labelledby="tool-title">
            <a href="#herramientas" onClick={() => navigate("home")}>
              Volver al índice de herramientas
            </a>
            <p className="eyebrow">HERRAMIENTA {tool.number} / GRATUITA</p>
            <h1 id="tool-title" ref={heading} tabIndex="-1">
              {tool.title}
            </h1>
            <p className="lead">{tool.description}</p>
            {!user && (
              <p className="registration-note">
                El registro es gratis. Solo guardamos tus datos de cuenta y
                métricas de uso.{" "}
                <button className="text-button" onClick={() => openAccount()}>
                  Crear mi cuenta
                </button>
              </p>
            )}
            {page === "tts" && (
              <TTS requireUser={requireUser} metric={metric} />
            )}{" "}
            {page === "stt" && (
              <STT requireUser={requireUser} metric={metric} />
            )}{" "}
            {page === "dyslexia" && (
              <Dyslexia requireUser={requireUser} metric={metric} />
            )}
          </section>
        )}
        <section id="acerca" className="about">
          <p className="eyebrow">ACCESIBILIDAD QUE NOS UNE</p>
          <h2>Unión Cordobesa de Ciegos</h2>
          <p>
            UCORCI es una institución sin fines de lucro de Córdoba, Argentina.
            Este espacio reúne herramientas gratuitas para acompañar a personas
            ciegas y con baja visión, desde Argentina para el mundo.
          </p>
          <p>
            Nos registramos para mejorar: las métricas nos ayudan a conocer qué
            herramientas se usan, medir su rendimiento y hacerlas cada vez más
            útiles.
          </p>
        </section>
        <details id="privacidad">
          <summary>Privacidad y tus datos</summary>
          <p>
            Guardamos nombre, apellido, correo, contraseña mediante hash seguro,
            cuentas sociales vinculadas y métricas de herramienta, tiempo de
            procesamiento, fecha y resultado. No guardamos tus documentos,
            textos ni audios.
          </p>
          <p>
            Al generar audio con Google Translate, el texto se envía a Google.
            La extracción de documentos y Whisper en el navegador se procesan en
            tu dispositivo. El modelo Whisper se descarga desde Hugging Face la
            primera vez y puede requerir cientos de megabytes. Si elegís un
            servicio local, tu audio se envía a ese servicio.
          </p>
          <p>
            Tu sesión puede durar hasta 90 días mediante una cookie protegida.
            Nunca guardamos tu contraseña en el navegador por nuestra cuenta:
            podés usar el gestor de contraseñas que elijas. En dispositivos
            compartidos, cerrá sesión al terminar. Podés exportar tus datos o
            borrar tu cuenta desde «Mi cuenta».
          </p>
          <p>
            Las cuentas de correo no verifican aún la titularidad del email. No
            las uses para información sensible. Los accesos sociales validan la
            identidad con el proveedor configurado.
          </p>
        </details>
        <details id="declaracion">
          <summary>Declaración de accesibilidad y ayuda</summary>
          <p>
            Usamos HTML semántico, enlaces para saltar al contenido, títulos
            ordenados, etiquetas visibles, estados anunciados, foco visible,
            controles nativos, contraste alto y navegación por teclado. No hay
            reproducción automática ni símbolos decorativos en las
            transcripciones.
          </p>
          <p>
            Objetivo: WCAG 2.2 nivel AA. La compatibilidad completa con NVDA,
            JAWS, TalkBack y VoiceOver requiere pruebas manuales con cada lector
            y dispositivo; no se afirma certificación.
          </p>
          <p>
            PDF: se extrae texto seleccionable; los PDF escaneados necesitan
            OCR, todavía no disponible. Word: .docx. Excel: .xlsx, todas las
            hojas. TXT y HTML: texto plano. Máximo por documento: 20 MB. Revisá
            siempre la extracción y la transcripción antes de usarlas.
          </p>
          <p>
            Comic Sans es una preferencia de lectura, no un tratamiento ni una
            fuente adecuada para todas las personas con dislexia. En
            dispositivos que no la tienen usamos Comic Neue. Podés elegir la
            fuente que te resulte más cómoda.
          </p>
        </details>
      </main>
      <footer>
        <strong>UCORCI</strong>
        <p>Herramientas de Accesibilidad</p>
        <p>Gratis. Para todas las personas.</p>
        <a href="#privacidad">Privacidad</a>
        <a href="#declaracion">Accesibilidad y ayuda</a>
        <a href="https://github.com/gianantonel/ucorci-herramientas-de-accesibilidad">
          Código abierto
        </a>
      </footer>
      <dialog
        ref={dialog}
        aria-labelledby="account-title"
        onCancel={() => returnFocus.current?.focus()}
      >
        <div className="dialog-top">
          <p className="eyebrow">TU ESPACIO UCORCI</p>
          <button onClick={closeAccount}>Cerrar</button>
        </div>
        <h2 id="account-title">
          {authMode === "account"
            ? "Mi cuenta"
            : authMode === "profile"
              ? "Completá tus datos"
              : authMode === "login"
                ? "Iniciar sesión"
                : "Registrarse gratis"}
        </h2>
        {authMode === "account" ? (
          <>
            <p>{user?.name}</p>
            <p>{user?.email}</p>
            <p>
              La sesión se recuerda en este dispositivo hasta 90 días. En un
              dispositivo compartido, cerrala al terminar.
            </p>
            <button
              onClick={async () => {
                try {
                  const data = await api("/api/account/export");
                  download(
                    JSON.stringify(data, null, 2),
                    "ucorci-mis-datos.json",
                    "application/json",
                  );
                } catch (e) {
                  setAccountError(e.message);
                }
              }}
            >
              Descargar mis datos
            </button>
            <button onClick={logout}>Cerrar sesión</button>
            <details>
              <summary>Eliminar mi cuenta y mis datos</summary>
              <p>Esta acción elimina tus datos y métricas permanentemente.</p>
              <button
                onClick={async () => {
                  if (
                    !window.confirm(
                      "¿Eliminar definitivamente tu cuenta UCORCI y sus métricas?",
                    )
                  )
                    return;
                  try {
                    await api("/api/account", { method: "DELETE" });
                    await logout();
                    setNotice("Tu cuenta y tus datos fueron eliminados.");
                  } catch (e) {
                    setAccountError(e.message);
                  }
                }}
              >
                Eliminar definitivamente
              </button>
            </details>
          </>
        ) : (
          <>
            <p>
              {authMode === "profile"
                ? "Necesitamos tu nombre y apellido para completar el registro."
                : "Acceso gratuito. Tus datos nos ayudan a mejorar las herramientas."}
            </p>
            {health?.databaseConfigured === false && (
              <p className="callout">
                El registro estará disponible cuando se conecte la base de
                datos.
              </p>
            )}
            <form onSubmit={submitAccount}>
              {authMode !== "login" && (
                <div className="two-columns">
                  <Field
                    label="Nombre"
                    id="firstName"
                    autoComplete="given-name"
                    defaultValue={user?.firstName || ""}
                    maxLength="80"
                    required
                  />
                  <Field
                    label="Apellido"
                    id="lastName"
                    autoComplete="family-name"
                    defaultValue={user?.lastName || ""}
                    maxLength="80"
                    required
                  />
                </div>
              )}
              {authMode !== "profile" && (
                <>
                  <Field
                    label="Correo electrónico"
                    id="email"
                    type="email"
                    autoComplete="username"
                    required
                    maxLength="254"
                  />
                  <Field
                    label="Contraseña"
                    id="password"
                    type="password"
                    autoComplete={
                      authMode === "register"
                        ? "new-password"
                        : "current-password"
                    }
                    required
                    minLength={authMode === "register" ? 12 : undefined}
                    maxLength="72"
                  />
                  {authMode === "register" && (
                    <>
                      <p className="field-help">
                        Usá al menos 12 caracteres. Podés guardarla en tu gestor
                        de contraseñas.
                      </p>
                      <label className="checkbox">
                        <input name="consent" type="checkbox" required />
                        Acepto guardar mis datos de cuenta y métricas de uso
                        para mejorar las herramientas.{" "}
                        <a href="#privacidad" onClick={closeAccount}>
                          Ver privacidad
                        </a>
                        .
                      </label>
                    </>
                  )}
                </>
              )}
              <button className="primary" disabled={accountBusy}>
                {accountBusy
                  ? "Procesando…"
                  : authMode === "register"
                    ? "Crear mi cuenta gratis"
                    : authMode === "profile"
                      ? "Guardar datos"
                      : "Iniciar sesión"}
              </button>
            </form>
            {authMode !== "profile" && (
              <>
                <button
                  className="text-button"
                  onClick={() => {
                    setAuthMode(authMode === "register" ? "login" : "register");
                    setAccountError("");
                  }}
                >
                  {authMode === "register"
                    ? "Ya tengo una cuenta"
                    : "Quiero crear una cuenta"}
                </button>
                <div className="social">
                  <p>Otras formas de acceder</p>
                  {(health?.oauth || []).map((provider) => (
                    <button
                      key={provider}
                      onClick={async () => {
                        try {
                          const data = health?.nativeOAuth?.includes(provider)
                            ? await api("/api/oauth/start", {
                                method: "POST",
                                body: JSON.stringify({ provider }),
                              })
                            : await signIn(provider);
                          location.href = data.url;
                        } catch (e) {
                          setAccountError(e.message);
                        }
                      }}
                    >
                      Continuar con{" "}
                      {provider === "github"
                        ? "GitHub"
                        : provider.charAt(0).toUpperCase() + provider.slice(1)}
                    </button>
                  ))}
                  {!health?.oauth?.length && (
                    <p>
                      Google y GitHub usan el acceso de InsForge. Apple y
                      Facebook requieren configurar credenciales propias.
                    </p>
                  )}
                </div>
              </>
            )}
          </>
        )}
        {accountError && (
          <p role="alert" className="error">
            {accountError}
          </p>
        )}
      </dialog>
    </>
  );
}
function Preference({ id, label, value, options, onChange }) {
  const disclosure = useRef(),
    summary = useRef();
  const current =
    options.find(([option]) => option === value)?.[1] || options[0][1];
  function close() {
    disclosure.current.open = false;
    summary.current.focus();
  }
  return (
    <details
      ref={disclosure}
      className="preference"
      name="ucorci-preferences"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          close();
        }
      }}
    >
      <summary ref={summary}>
        {label}: {current}
      </summary>
      <fieldset className="preference-options">
        <legend>{label}</legend>
        {options.map(([option, text]) => (
          <label key={option}>
            <input
              type="radio"
              name={"preference-" + id}
              value={option}
              checked={value === option}
              onChange={() => onChange(option)}
              onClick={(event) => {
                if (event.detail > 0) close();
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  close();
                }
              }}
            />
            <span>{text}</span>
          </label>
        ))}
      </fieldset>
    </details>
  );
}
function Field({ label, id, ...props }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input id={id} name={id} {...props} />
    </div>
  );
}
function FileInput({ onText, disabled = false }) {
  const [state, setState] = useState("");
  return (
    <div className="upload">
      <label htmlFor="document">Cargar un documento</label>
      <input
        id="document"
        type="file"
        accept=".pdf,.docx,.xlsx,.txt,.html,.htm"
        disabled={disabled}
        onChange={async (e) => {
          const file = e.target.files[0];
          if (!file) return;
          setState("Extrayendo texto…");
          try {
            const text = await extractText(file);
            if (!text.trim())
              throw new Error("No encontramos texto en el archivo.");
            onText(text);
            setState(
              `Texto extraído de ${file.name}. Revisalo antes de continuar.`,
            );
          } catch (error) {
            setState(error.message);
          }
          e.target.value = "";
        }}
      />
      <p className="field-help">
        PDF con texto, Word .docx, Excel .xlsx, TXT o HTML. Hasta 20 MB. El
        archivo se procesa en este dispositivo.
      </p>
      <p role="status">{state}</p>
    </div>
  );
}
function TTS({ requireUser, metric }) {
  const [text, setText] = useState(""),
    [slow, setSlow] = useState(false),
    [format, setFormat] = useState("mp3"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [status, setStatus] = useState(""),
    [audio, setAudio] = useState(null),
    [url, setUrl] = useState(""),
    [speaking, setSpeaking] = useState(false),
    [paused, setPaused] = useState(false);
  const startRef = useRef(0),
    playCounted = useRef(false);
  useEffect(() => {
    if (!audio) {
      setUrl("");
      return;
    }
    const value = URL.createObjectURL(audio);
    setUrl(value);
    return () => URL.revokeObjectURL(value);
  }, [audio]);
  useEffect(() => () => window.speechSynthesis?.cancel(), []);
  function listen() {
    if (!text.trim()) {
      setError("Escribí o cargá texto para escuchar.");
      return;
    }
    if (!requireUser()) return;
    if (!("speechSynthesis" in window)) {
      setError(
        "Este navegador no ofrece voces del dispositivo. Usá Generar audio.",
      );
      return;
    }
    speechSynthesis.cancel();
    setError("");
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "es-AR";
    utterance.rate = slow ? 0.75 : 1;
    const voices = speechSynthesis.getVoices();
    utterance.voice =
      voices.find((v) => v.lang.toLowerCase() === "es-ar") ||
      voices.find((v) => v.lang.startsWith("es")) ||
      null;
    startRef.current = performance.now();
    playCounted.current = false;
    utterance.onend = () => {
      setSpeaking(false);
      setPaused(false);
      setStatus("Lectura finalizada.");
      if (!playCounted.current) {
        playCounted.current = true;
        metric("tts", startRef.current);
      }
    };
    utterance.onerror = (event) => {
      setSpeaking(false);
      setPaused(false);
      if (!["interrupted", "canceled"].includes(event.error))
        setError(
          "La voz del dispositivo no respondió. Intentá generar un audio.",
        );
    };
    speechSynthesis.speak(utterance);
    setSpeaking(true);
    setPaused(false);
    setStatus("Leyendo con la voz disponible en este dispositivo.");
  }
  async function generate() {
    if (!text.trim()) {
      setError("Escribí o cargá texto para generar audio.");
      return;
    }
    if (text.length > 5000) {
      setError(
        "Para generar audio, dividí el texto en partes de hasta 5000 caracteres.",
      );
      return;
    }
    if (!requireUser()) return;
    setBusy(true);
    setError("");
    setAudio(null);
    const start = performance.now();
    setStatus("Generando audio con Google Translate…");
    try {
      const response = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, slow }),
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "No se pudo generar audio.");
      }
      let blob = await response.blob();
      if (format === "wav") {
        setStatus("Convirtiendo a WAV en tu dispositivo…");
        blob = await mp3ToWav(blob);
      }
      setAudio(blob);
      setStatus("Audio listo. Podés escucharlo o descargarlo.");
      metric("tts", start);
    } catch (e) {
      setError(e.message);
      setStatus("");
      metric("tts", start, "error");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="tool-layout">
      <div>
        <FileInput
          onText={(value) => {
            setText(value);
            setAudio(null);
          }}
          disabled={busy}
        />
        <label htmlFor="tts-text">Texto para convertir a voz</label>
        <textarea
          id="tts-text"
          rows="12"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setAudio(null);
          }}
          placeholder="Escribí o pegá tu texto acá…"
          disabled={busy}
        />
        <p className="field-help">
          {text.length.toLocaleString("es-AR")} caracteres. Hasta 5000 por audio
          descargable.
        </p>
        <div className="two-columns">
          <div>
            <label htmlFor="audio-format">Formato de descarga</label>
            <select
              id="audio-format"
              value={format}
              onChange={(e) => {
                setFormat(e.target.value);
                setAudio(null);
              }}
              disabled={busy}
            >
              <option value="mp3">MP3</option>
              <option value="wav">WAV</option>
            </select>
          </div>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={slow}
              onChange={(e) => setSlow(e.target.checked)}
              disabled={busy}
            />
            Voz más lenta
          </label>
        </div>
        <div className="actions">
          <button className="primary" onClick={generate} disabled={busy}>
            {busy ? "Generando audio…" : "Generar audio"}
          </button>
          <button onClick={listen} disabled={busy}>
            Escuchar con mi dispositivo
          </button>
          {speaking && (
            <>
              <button
                onClick={() => {
                  if (paused) speechSynthesis.resume();
                  else speechSynthesis.pause();
                  setPaused(!paused);
                }}
              >
                {paused ? "Continuar lectura" : "Pausar lectura"}
              </button>
              <button
                onClick={() => {
                  speechSynthesis.cancel();
                  setSpeaking(false);
                  setPaused(false);
                  setStatus("Lectura detenida.");
                }}
              >
                Detener lectura
              </button>
            </>
          )}
        </div>
        <p role="status">{status}</p>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {audio && url && (
          <section className="result" aria-label="Audio generado">
            <h2>Tu audio está listo</h2>
            <audio controls src={url} aria-label="Escuchar audio generado" />
            <a
              className="primary"
              href={url}
              download={
                "ucorci-voz." + (audio.type === "audio/wav" ? "wav" : "mp3")
              }
            >
              Descargar audio
            </a>
          </section>
        )}
      </div>
      <aside className="help">
        <h2>Del texto a la escucha</h2>
        <ol>
          <li>Escribí o cargá tu documento.</li>
          <li>Revisá el texto extraído.</li>
          <li>Elegí MP3 o WAV y generá el audio.</li>
        </ol>
        <p>
          Google Translate recibe el texto para generar la voz. Configuración:
          español y dominio argentino. La voz exacta depende de Google y puede
          cambiar.
        </p>
        <p>
          «Escuchar con mi dispositivo» usa las voces de tu sistema; puede no
          incluir una voz argentina y no permite descargar audio.
        </p>
        <p>
          Los documentos escaneados necesitan OCR. Los archivos .doc o .xls
          deben convertirse a .docx o .xlsx.
        </p>
      </aside>
    </div>
  );
}
function STT({ requireUser, metric }) {
  const [file, setFile] = useState(null),
    [text, setText] = useState(""),
    [busy, setBusy] = useState(false),
    [status, setStatus] = useState(""),
    [error, setError] = useState(""),
    [engine, setEngine] = useState("browser"),
    [recording, setRecording] = useState(false);
  const worker = useRef(),
    recorder = useRef(),
    stream = useRef(),
    chunks = useRef([]),
    input = useRef(),
    start = useRef(0),
    statusTime = useRef(0);
  const service = import.meta.env.VITE_STT_SERVICE_URL;
  useEffect(
    () => () => {
      worker.current?.terminate();
      recorder.current?.state === "recording" && recorder.current.stop();
      stream.current?.getTracks().forEach((t) => t.stop());
    },
    [],
  );
  async function transcribe() {
    if (!file) {
      setError("Elegí o grabá un audio.");
      return;
    }
    if (!requireUser()) return;
    if (file.size > 25 * 1024 * 1024) {
      setError("El audio supera 25 MB. Dividilo en archivos más pequeños.");
      return;
    }
    setError("");
    setText("");
    setBusy(true);
    start.current = performance.now();
    try {
      if (engine === "local") {
        setStatus("Enviando audio al servicio faster-whisper configurado…");
        const form = new FormData();
        form.append("audio", file);
        const response = await fetch(
          service.replace(/\/$/, "") + "/transcribe",
          { method: "POST", body: form },
        );
        const result = await response.json();
        if (!response.ok)
          throw new Error(result.error || "El servicio no pudo transcribir.");
        setText(plainText(result.text));
        setStatus("Transcripción lista. Revisá el resultado.");
        setBusy(false);
        metric("stt", start.current);
        return;
      }
      setStatus("Preparando audio en el dispositivo…");
      const context = new AudioContext();
      let audio;
      try {
        audio = await context.decodeAudioData(await file.arrayBuffer());
      } finally {
        await context.close();
      }
      if (audio.duration > 600)
        throw new Error(
          "Para transcribir en el navegador, dividí el audio en partes de hasta 10 minutos.",
        );
      const offline = new OfflineAudioContext(
        1,
        Math.ceil(audio.duration * 16000),
        16000,
      );
      const source = offline.createBufferSource();
      source.buffer = audio;
      source.connect(offline.destination);
      source.start();
      const mono = (await offline.startRendering()).getChannelData(0);
      worker.current ??= new Worker(
        new URL("./stt.worker.js", import.meta.url),
        { type: "module" },
      );
      worker.current.onmessage = ({ data }) => {
        if (data.status === "loading") {
          if (Date.now() - statusTime.current > 2500) {
            setStatus(
              `Descargando el modelo Whisper base: ${data.progress} % del archivo actual. La primera descarga puede tardar varios minutos.`,
            );
            statusTime.current = Date.now();
          }
        } else if (data.status === "transcribing")
          setStatus(
            "Transcribiendo en tu dispositivo. Podés cancelar cuando quieras.",
          );
        else if (data.status === "done") {
          setText(plainText(data.text));
          setBusy(false);
          setStatus("Transcripción lista. Revisá el resultado.");
          metric("stt", start.current);
        } else if (data.status === "error") {
          setError(data.error);
          setStatus("");
          setBusy(false);
          metric("stt", start.current, "error");
        }
      };
      worker.current.onerror = () => {
        setError(
          "No se pudo iniciar el modelo en este navegador. Probá otro navegador o el servicio local.",
        );
        setBusy(false);
        setStatus("");
        worker.current?.terminate();
        worker.current = null;
        metric("stt", start.current, "error");
      };
      setStatus(
        "Cargando Whisper base. La primera vez se descarga el modelo gratuito…",
      );
      worker.current.postMessage({ audio: mono }, [mono.buffer]);
    } catch (e) {
      setError(e.message);
      setStatus("");
      setBusy(false);
      metric("stt", start.current, "error");
    }
  }
  async function record() {
    if (!requireUser()) return;
    setError("");
    try {
      if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder)
        throw new Error(
          "Este navegador no permite grabar. Subí un archivo de audio.",
        );
      stream.current = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      chunks.current = [];
      recorder.current = new MediaRecorder(stream.current);
      recorder.current.ondataavailable = (e) => {
        if (e.data.size) chunks.current.push(e.data);
      };
      recorder.current.onstop = () => {
        const type = recorder.current.mimeType;
        setFile(
          new File(
            chunks.current,
            ["audio-grabado." + (type.includes("mp4") ? "m4a" : "webm")],
            { type },
          ),
        );
        stream.current.getTracks().forEach((t) => t.stop());
        setRecording(false);
        setStatus("Grabación lista para transcribir.");
      };
      recorder.current.start();
      setRecording(true);
      setStatus("Grabando. Presioná Detener grabación cuando termines.");
    } catch (e) {
      stream.current?.getTracks().forEach((t) => t.stop());
      setError(
        e.name === "NotAllowedError"
          ? "No se autorizó el micrófono. Podés subir un archivo."
          : e.message,
      );
    }
  }
  return (
    <div className="tool-layout">
      <div>
        <div className="upload">
          <label htmlFor="audio-file">Cargar audio</label>
          <input
            ref={input}
            id="audio-file"
            type="file"
            accept="audio/*,.mp3,.wav,.m4a,.ogg,.webm,.flac"
            disabled={busy || recording}
            onChange={(e) => {
              setFile(e.target.files[0] || null);
              setText("");
            }}
          />
          <p className="field-help">
            Hasta 25 MB y 10 minutos en el navegador. La compatibilidad del
            formato depende del navegador.
          </p>
          {file && <p>Audio seleccionado: {file.name}</p>}
        </div>
        <div className="actions">
          <button onClick={record} disabled={busy || recording}>
            Grabar con el micrófono
          </button>
          {recording && (
            <button onClick={() => recorder.current.stop()}>
              Detener grabación
            </button>
          )}
        </div>
        <label htmlFor="stt-engine">Motor de transcripción</label>
        <select
          id="stt-engine"
          value={engine}
          onChange={(e) => setEngine(e.target.value)}
          disabled={busy}
        >
          <option value="browser">Whisper base en este dispositivo</option>
          {service && (
            <option value="local">Servicio local faster-whisper base</option>
          )}
        </select>
        <div className="actions">
          <button
            className="primary"
            onClick={transcribe}
            disabled={busy || recording}
          >
            {busy ? "Transcribiendo…" : "Convertir audio a texto"}
          </button>
          {busy && engine === "browser" && (
            <button
              onClick={() => {
                worker.current?.terminate();
                worker.current = null;
                setBusy(false);
                setStatus("Transcripción cancelada.");
              }}
            >
              Cancelar transcripción
            </button>
          )}
        </div>
        <p role="status">{status}</p>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <label htmlFor="transcript">Transcripción en texto plano</label>
        <textarea
          id="transcript"
          rows="12"
          value={text}
          onChange={(e) => setText(plainText(e.target.value))}
          placeholder="La transcripción aparecerá acá. Podés corregirla antes de descargarla."
        />
        <div className="actions">
          <button
            disabled={!text}
            onClick={() =>
              download(plainText(text), "ucorci-transcripcion.txt")
            }
          >
            Descargar TXT
          </button>
          <button
            disabled={!text}
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(plainText(text));
                setStatus("Texto copiado.");
              } catch {
                setError(
                  "No se pudo copiar. Seleccioná el texto y copialo con tu teclado.",
                );
              }
            }}
          >
            Copiar texto
          </button>
        </div>
      </div>
      <aside className="help">
        <h2>Tu audio, en palabras</h2>
        <ol>
          <li>Cargá un audio o grabá con el micrófono.</li>
          <li>Convertí el audio a texto.</li>
          <li>Revisá y descargá un archivo TXT.</li>
        </ol>
        <p>
          Whisper base funciona sin API paga. En este modo el audio permanece en
          tu dispositivo. La primera vez descarga el modelo y necesita conexión
          y memoria disponible.
        </p>
        <p>
          El texto conserva las palabras y la puntuación para facilitar la
          lectura con NVDA, JAWS, TalkBack y VoiceOver.
        </p>
        <p>
          Una transcripción automática puede tener errores. Revisá nombres,
          números y palabras antes de compartirla.
        </p>
      </aside>
    </div>
  );
}
function Dyslexia({ requireUser, metric }) {
  const [text, setText] = useState(""),
    [result, setResult] = useState(""),
    [fontSize, setFontSize] = useState(24),
    [spacing, setSpacing] = useState(0.03),
    [line, setLine] = useState(1.8),
    [status, setStatus] = useState("");
  return (
    <div className="tool-layout">
      <div>
        <FileInput onText={setText} />
        <label htmlFor="dyslexia-text">Texto para adaptar</label>
        <textarea
          id="dyslexia-text"
          rows="9"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Escribí, pegá o cargá el texto que querés leer."
        />
        <fieldset>
          <legend>Preferencias de lectura</legend>
          <label htmlFor="reader-size">
            Tamaño de letra: {fontSize} píxeles
          </label>
          <input
            id="reader-size"
            type="range"
            min="18"
            max="48"
            value={fontSize}
            onChange={(e) => setFontSize(Number(e.target.value))}
          />
          <label htmlFor="reader-spacing">
            Espacio entre letras: {spacing.toFixed(2)} em
          </label>
          <input
            id="reader-spacing"
            type="range"
            min="0"
            max="0.12"
            step="0.01"
            value={spacing}
            onChange={(e) => setSpacing(Number(e.target.value))}
          />
          <label htmlFor="reader-line">Interlineado: {line.toFixed(1)}</label>
          <input
            id="reader-line"
            type="range"
            min="1.3"
            max="2.5"
            step="0.1"
            value={line}
            onChange={(e) => setLine(Number(e.target.value))}
          />
        </fieldset>
        <button
          className="primary"
          onClick={() => {
            if (!text.trim()) {
              setStatus("Escribí o cargá texto para adaptar.");
              return;
            }
            if (!requireUser()) return;
            const start = performance.now();
            setResult(text);
            setStatus(
              "Texto adaptado. El contenido no cambia; solo cambia la presentación.",
            );
            metric("dyslexia", start);
          }}
        >
          Adaptar texto
        </button>
        <p role="status">{status}</p>
        {result && (
          <section className="result">
            <h2>Tu lectura personalizada</h2>
            <div
              className="reading"
              style={{
                fontSize: fontSize + "px",
                letterSpacing: spacing + "em",
                lineHeight: line,
              }}
            >
              {result}
            </div>
            <div className="actions">
              <button onClick={() => download(result, "ucorci-lectura.txt")}>
                Descargar texto TXT
              </button>
              <button
                onClick={() => {
                  const escape = (s) =>
                    s.replace(
                      /[&<>"']/g,
                      (c) =>
                        ({
                          "&": "&amp;",
                          "<": "&lt;",
                          ">": "&gt;",
                          '"': "&quot;",
                          "'": "&#39;",
                        })[c],
                    );
                  const html = `<!doctype html><html lang="es-AR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Lectura personalizada UCORCI</title><style>body{background:#000;color:#fff;font-family:"Comic Sans MS","Comic Neue",cursive;font-size:${fontSize}px;letter-spacing:${spacing}em;line-height:${line};max-width:70ch;margin:auto;padding:2rem;white-space:pre-wrap;overflow-wrap:anywhere}</style><body>${escape(result)}</body></html>`;
                  download(
                    html,
                    "ucorci-lectura.html",
                    "text/html;charset=utf-8",
                  );
                }}
              >
                Descargar lectura HTML
              </button>
              <button onClick={() => window.print()}>Imprimir lectura</button>
            </div>
          </section>
        )}
      </div>
      <aside className="help">
        <h2>Una lectura más cómoda</h2>
        <p>
          Esta herramienta mantiene las palabras originales y cambia su
          presentación: Comic Sans, texto alineado a la izquierda y espacios
          ajustables.
        </p>
        <p>
          La fuente que facilita leer varía de persona a persona. Comic Sans es
          una opción; no se garantiza que sea adecuada para todas las personas
          con dislexia.
        </p>
        <p>
          El archivo HTML conserva los ajustes de lectura; usa Comic Sans si
          está instalada. El archivo TXT conserva solo el texto, sin formato.
        </p>
        <p>
          También podés cambiar la fuente de toda la web desde el selector
          superior.
        </p>
      </aside>
    </div>
  );
}
createRoot(document.getElementById("root")).render(<App />);
