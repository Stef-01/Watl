export function Footer() {
  return (
    <footer className="footer">
      <div className="section__inner footer__inner">
        <p className="footer__identity label">
          <span>WATL</span>
          <span aria-hidden="true">·</span>
          <span>Wattle Technologies</span>
        </p>
        <ul className="footer__links label">
          <li><a href="mailto:Stefan.thottunkal@gmail.com">Email</a></li>
          <li><a href="https://github.com/Stef-01/Watl" rel="noreferrer">Source</a></li>
          <li><a href="#main">Top</a></li>
        </ul>
        <p className="footer__note label">
          A procedural Golden Wattle, grown live. © {new Date().getFullYear()}
        </p>
      </div>
    </footer>
  );
}
