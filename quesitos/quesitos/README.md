# Quesitos

El trivial clásico para Android: tablero de rueda con sus 6 categorías, quesitos, casillas de «vuelve a tirar» y pregunta final en el centro. Todo en español y sin conexión.

## Modos de juego

- **Solitario:** tú contra 1, 2 o 3 rivales de la CPU. Niveles fácil, normal, difícil, experto y adaptativo. El adaptativo copia tus aciertos por categoría y se endurece cuando le ganas. Las preguntas que te tocan se ajustan a lo que dominas, y cada partida mueve tu puntuación.
- **Entrenamiento:** preguntas sin fin de lo que peor se te da. Las que fallas vuelven al poco rato hasta que las aciertas tres veces seguidas y quedan dominadas.
- **Partida normal:** de 2 a 6 jugadores en el mismo móvil (personas o CPU). Cada jugador tiene 30 segundos para tirar el dado; si se le pasa, pierde el turno.
- **Partida larga:** igual, pero sin reloj. Se guarda sola para seguirla otro día.

Además: perfiles con estadísticas por categoría y dificultad, modo de respuesta clásico (dices la respuesta en voz alta y la destapas), tiempo opcional para responder, botón de pausa (también con el botón «atrás» de Android), sonidos, vibración, packs de preguntas y copia de seguridad.

## Cómo conseguir el APK

1. Crea un repositorio nuevo en GitHub (por ejemplo, `quesitos`).
2. Sube **todo** el contenido de esta carpeta, incluidas las carpetas ocultas `.github` y `android-keystore`. Si lo subes desde la web de GitHub, arrastra la carpeta entera; si no ves `.github`, activa «mostrar archivos ocultos» en tu ordenador.
3. Al subirlo a la rama `main`, GitHub compila la app solo. Míralo en la pestaña **Actions** (tarda unos 5 minutos).
4. Cuando termine, ve a **Releases** (a la derecha en la página del repositorio) y descarga `Quesitos.apk` desde el móvil.
5. Ábrelo y acepta instalar apps de origen desconocido si Android lo pide.

Para que tus amigos la instalen, pásales el enlace de Releases. Cada vez que cambies algo y lo subas, saldrá una versión nueva que se instala encima de la anterior sin perder estadísticas, porque el proyecto usa siempre la misma firma (la de `android-keystore/`).

Si la pestaña Actions muestra un error de permisos al publicar, ve a Settings > Actions > General > Workflow permissions y marca «Read and write permissions».

## Probarla en el ordenador

Abre `www/index.html` en Chrome. Con las herramientas de desarrollo en vista de móvil se ve igual que en el teléfono.

## Añadir preguntas

Desde la app: **Ajustes > Añadir un pack de preguntas**, pegando el texto o abriendo un archivo `.json`. Formato (mira `ejemplo-pack.json`):

```json
[
  {
    "categoria": "historia",
    "dificultad": 2,
    "pregunta": "¿En qué año empezó la Primera Guerra Mundial?",
    "respuesta": "1914",
    "incorrectas": ["1912", "1916", "1918"]
  }
]
```

Categorías: `geografia`, `espectaculos`, `historia`, `arte`, `ciencias`, `deportes` (o los números 0 a 5). Dificultad: 1 fácil, 2 media, 3 difícil.

Para que las preguntas vayan dentro de la app para todo el mundo, añádelas a `www/questions.js` y súbelo: la siguiente versión del APK ya las llevará.

## Estructura

- `www/`: la app (HTML, CSS y JavaScript, sin dependencias).
- `www/questions.js`: el banco de preguntas.
- `assets/`: icono y pantalla de carga.
- `.github/workflows/compilar-apk.yml`: la compilación automática.
- `android-keystore/`: firma fija para poder actualizar la app. Al ser un proyecto personal no pasa nada por que esté en el repositorio; si algún día la publicas en Google Play, crea una firma privada nueva.
