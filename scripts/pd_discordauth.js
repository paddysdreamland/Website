async function initDiscordHeader() {
  const loggedOut = document.getElementById('logged-out-wrapper');
  const loggedIn  = document.getElementById('logged-in-wrapper');

  try {
    const res = await fetch('/auth/me.php');        // same-origin: cookie rides along
    const data = await res.json();

    if (data.authenticated) {
      document.getElementById('discord-display-name').textContent = data.user.displayName;
      document.getElementById('discord-profile-image').style.backgroundImage =
        `url('${data.user.avatarUrl}')`;
      loggedIn.style.display = '';
      loggedOut.style.display = 'none';
    } else {
      loggedOut.style.display = '';
      loggedIn.style.display = 'none';
    }
  } catch (e) {
    // network/parse failure — fall back to the logged-out view
    loggedOut.style.display = '';
    loggedIn.style.display = 'none';
  }

  // wire the two buttons
  document.getElementById('discord-login')
    .addEventListener('click', () => { window.location.href = '/auth/login.php'; });
  document.getElementById('discord-logout')
    .addEventListener('click', async () => {
      await fetch('/auth/logout.php', { headers: { 'Accept': 'application/json' } });
      window.location.reload();
    });

    document.getElementById('discord-unlink').addEventListener('click', async () => {
        if (!confirm('This permanently deletes your account and all your reactions. This cannot be undone. Continue?')) {
            return;
        }
        const res = await fetch('/auth/unlink.php', {
            method: 'POST',
            headers: { 'Accept': 'application/json' }
        });
        if (res.ok) {
            window.location.href = '/';   // they're gone now — send them home
        } else {
            alert('Something went wrong. Please try again or contact me directly.');
        }
    });
}

document.addEventListener('DOMContentLoaded', initDiscordHeader);