// Manages the full-screen exhibit read panel
export class ExhibitUI {
  constructor() {
    this._el = null
    this._build()

    document.addEventListener('exhibit:open', e => this.open(e.detail))
    document.addEventListener('keydown', e => {
      if (e.code === 'KeyE' || e.code === 'Escape') this.close()
    })
  }

  _build() {
    const el = document.createElement('div')
    el.id = 'exhibit-modal'
    el.innerHTML = `
      <div class="exhibit-inner">
        <div class="exhibit-eyebrow">Dreamland Archive</div>
        <h2 class="exhibit-title"></h2>
        <div class="exhibit-body"></div>
        <div class="exhibit-footer">
          <a class="exhibit-link" href="https://paddysdreamland.com" target="_blank">
            Visit paddysdreamland.com ↗
          </a>
          <button class="exhibit-close">Close <kbd>E</kbd></button>
        </div>
      </div>
    `

    const style = document.createElement('style')
    style.textContent = `
      #exhibit-modal {
        position: fixed;
        inset: 0;
        z-index: 300;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(8,11,16,0.88);
        backdrop-filter: blur(12px);
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.3s;
      }
      #exhibit-modal.open {
        opacity: 1;
        pointer-events: all;
      }
      .exhibit-inner {
        width: min(640px, 90vw);
        padding: 52px 56px;
        background: rgba(14,18,28,0.95);
        border: 1px solid rgba(126,207,255,0.15);
        border-radius: 2px;
        position: relative;
      }
      .exhibit-inner::before {
        content: '';
        position: absolute;
        top: 0; left: 56px;
        width: 60px; height: 2px;
        background: var(--col-accent);
      }
      .exhibit-eyebrow {
        font-family: var(--font-ui);
        font-size: 9px;
        letter-spacing: 0.28em;
        text-transform: uppercase;
        color: var(--col-accent);
        margin-bottom: 18px;
        opacity: 0.8;
      }
      .exhibit-title {
        font-family: var(--font-display);
        font-size: clamp(1.5rem, 3vw, 2.2rem);
        font-weight: 300;
        letter-spacing: 0.02em;
        color: var(--col-fg);
        margin-bottom: 24px;
        line-height: 1.2;
      }
      .exhibit-body {
        font-family: var(--font-display);
        font-size: 1.05rem;
        font-weight: 300;
        line-height: 1.75;
        color: rgba(232,224,212,0.75);
        margin-bottom: 40px;
      }
      .exhibit-footer {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        border-top: 1px solid rgba(232,224,212,0.08);
        padding-top: 20px;
      }
      .exhibit-link {
        font-family: var(--font-ui);
        font-size: 10px;
        letter-spacing: 0.14em;
        color: var(--col-accent);
        text-decoration: none;
        text-transform: uppercase;
        transition: opacity 0.2s;
      }
      .exhibit-link:hover { opacity: 0.7; }
      .exhibit-close {
        font-family: var(--font-ui);
        font-size: 10px;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color: var(--col-dim);
        background: transparent;
        border: 1px solid rgba(232,224,212,0.15);
        padding: 7px 16px;
        cursor: pointer;
        border-radius: 1px;
        transition: border-color 0.2s, color 0.2s;
      }
      .exhibit-close:hover {
        border-color: rgba(232,224,212,0.4);
        color: var(--col-fg);
      }
    `

    document.head.appendChild(style)
    document.body.appendChild(el)
    this._el = el

    el.querySelector('.exhibit-close').addEventListener('click', () => this.close())
  }

  open(data) {
    this._el.querySelector('.exhibit-title').textContent = data.title
    this._el.querySelector('.exhibit-body').textContent  = data.body
    this._el.classList.add('open')
  }

  close() {
    this._el.classList.remove('open')
  }
}
