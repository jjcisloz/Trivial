# Jugar online (Android e iPhone): configuración de una sola vez

Firebase es un servicio gratuito de Google que hace de intermediario entre los móviles. El plan gratuito (Spark) admite 100 móviles conectados a la vez, así que para jugar con amigos no vas a pagar nada ni hace falta tarjeta.

Tardarás unos 15 minutos entre Firebase y GitHub. Los nombres de los botones pueden variar un poco si Google cambia la web.

## 1. Crear el proyecto

1. Entra en https://console.firebase.google.com con tu cuenta de Google.
2. Pulsa **Crear un proyecto** (o «Añadir proyecto»), ponle de nombre `quesitos` y continúa.
3. Cuando pregunte por Google Analytics, **desactívalo** (no hace falta) y crea el proyecto.

## 2. Activar el acceso anónimo

Sirve para que cada móvil tenga una identidad sin tener que registrarse.

1. En el menú de la izquierda: **Compilación** (o «Build») > **Authentication** > **Comenzar**.
2. Pestaña **Método de acceso** > **Anónimo** > actívalo > **Guardar**.
3. Pestaña **Configuración** > **Dominios autorizados** > **Añadir dominio** y escribe `TUUSUARIO.github.io` (tu nombre de usuario de GitHub). Es la dirección de la versión web, la que usan los iPhone.

## 3. Crear la base de datos

1. En el menú de la izquierda: **Compilación** > **Realtime Database** > **Crear base de datos**.
   Ojo: es **Realtime Database**, no «Firestore».
2. Ubicación: elige la de Europa (`europe-west1`).
3. Elige **modo bloqueado** y pulsa **Habilitar**.
4. Ve a la pestaña **Reglas**, borra lo que haya y pega el contenido del archivo `reglas-firebase.json` del proyecto:

```json
{
  "rules": {
    "salas": {
      "$sala": {
        ".read": "auth != null",
        ".write": "auth != null"
      }
    },
    "publicas": {
      ".read": "auth != null",
      "$sala": {
        ".write": "auth != null"
      }
    }
  }
}
```

5. Pulsa **Publicar**.

## 4. Copiar los datos de tu proyecto

1. Arriba a la izquierda, pulsa la rueda ⚙️ > **Configuración del proyecto**.
2. Baja hasta **Tus apps** y pulsa el icono web `</>`.
3. Ponle de apodo `quesitos`, **no** marques Firebase Hosting y pulsa **Registrar app**.
4. Verás un bloque de código con `const firebaseConfig = { ... }`. Te interesan estos valores: `apiKey`, `authDomain`, `databaseURL`, `projectId` y `appId`.

Si en ese bloque no aparece `databaseURL`, cópiala de la parte de arriba de la página de Realtime Database. Es algo como `https://quesitos-xxxx-default-rtdb.europe-west1.firebasedatabase.app`.

## 5. Pegarlos en la app

1. En tu repositorio de GitHub, abre `www/firebase-config.js` y pulsa el lápiz ✏️ para editarlo.
2. Cambia cada `PEGA_AQUI` por su valor, sin quitar las comillas. Quedará parecido a esto:

```js
window.FIREBASE_CONFIG = {
  apiKey: "AIzaSyB...",
  authDomain: "quesitos-xxxx.firebaseapp.com",
  databaseURL: "https://quesitos-xxxx-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "quesitos-xxxx",
  appId: "1:1234567890:web:abc123"
};
```

3. Pulsa **Commit changes**. GitHub compilará un APK nuevo en unos minutos (pestaña Actions y después Releases).

Estos datos no son secretos: es normal que estén en el repositorio. Lo que protege tu base de datos son las reglas del paso 3.

## 6. Activar la web (para los iPhone)

Apple no deja instalar apps fuera de su tienda, así que los iPhone usan la versión web, que funciona igual y se instala en la pantalla de inicio como una app más. GitHub la publica gratis junto con el APK.

1. En tu repositorio de GitHub: **Settings** > **Pages**.
2. En **Source** (o «Build and deployment»), elige **GitHub Actions**.
3. El repositorio tiene que ser **público** (en Settings > General, abajo del todo, «Change visibility»). Con una cuenta gratuita, GitHub solo publica webs de repositorios públicos.
4. Haz cualquier cambio o ve a **Actions** > «Compilar APK y publicar web» > **Run workflow** para que se publique.

La web quedará en `https://TUUSUARIO.github.io/NOMBRE-DEL-REPOSITORIO/`. Esa misma dirección sale en cada versión de **Releases**.

En el iPhone: abre esa dirección en **Safari**, pulsa el botón Compartir (el cuadrado con la flecha) > **Añadir a pantalla de inicio**. A partir de ahí se abre a pantalla completa con su icono, como cualquier app. Los móviles Android también pueden usar la web si no quieren instalar el APK.

## 7. Jugar

Todos entran en **Jugar online**, da igual que tengan el APK de Android o la web en un iPhone.

- **Con cualquiera:** pulsa **Buscar partida**. Te junta con otras personas que estén buscando en ese momento. En cuanto hay dos, empieza una cuenta atrás de 20 segundos por si entra alguien más, y la partida arranca sola.
- **Con tus amigos:** uno pulsa **Crear sala privada** y luego **Invitar**, que comparte un enlace y el código de 4 letras. Al abrir el enlace se entra directamente en la pantalla para unirse; también se puede escribir el código a mano. Quien creó la sala puede añadir CPUs y pulsa **Empezar partida**.

«Con cualquiera» significa cualquier persona que use **tu** versión de Quesitos (la de tu Firebase). Cuanta más gente la tenga, más fácil será encontrar partida.

Cosas que conviene saber:

- El móvil que crea la sala es el que «lleva» la partida. Si cierra la app, la partida se acaba para todos. Si solo pierde la conexión un rato, los demás esperan a que vuelva.
- Si un invitado se desconecta, la CPU juega por su ficha hasta que vuelve a entrar con el mismo código.
- Cada uno guarda sus estadísticas en su propio móvil y con su perfil.

## Si algo falla

- «Activa el acceso Anónimo»: falta el paso 2.
- «Revisa las reglas de la base de datos»: falta el paso 3.4 o no se pulsó Publicar.
- «Falta configurar Firebase»: el archivo `www/firebase-config.js` todavía tiene algún `PEGA_AQUI`, o falta `databaseURL`.
- En **Actions**, el trabajo «Web para iPhone» sale en rojo: falta el paso 6 (Pages con «GitHub Actions» y repositorio público). El APK se compila igualmente.
- En el iPhone no cambia nada tras una actualización: cierra la app del todo y ábrela dos veces; la primera descarga la versión nueva y la segunda la usa.
