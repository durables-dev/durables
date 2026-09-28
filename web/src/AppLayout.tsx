import { Link, Outlet } from "react-router";
import { UserSwitcher } from "./auth/UserSwitcher";
import styles from "./AppLayout.module.css";

export function AppLayout() {
  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <Link to="/" className={styles.brand}>
          Durables
        </Link>
        <nav className={styles.nav}>
          <Link to="/publish">Publish</Link>
          <Link to="/rubric">Rubric</Link>
        </nav>
        <UserSwitcher />
      </header>
      <main className={styles.main}>
        <Outlet />
      </main>
    </div>
  );
}
