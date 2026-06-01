# 📱 Guia de Compilação Android: Transforme o Lyra Chords em APK/AAB

Este guia detalha passo a passo como empacotar e compilar o web app **Lyra Chords** como um aplicativo Android nativo de alta performance para publicação na **Google Play Store**.

---

## 🚀 Método Recomendado: Capacitor (Ionic)

Para aplicações modernas construídas com **React, Vite e TypeScript**, o **Capacitor** é a tecnologia padrão do mercado. Ele atua como uma ponte ultraveloz, encapsulando os arquivos estáticos compilados (da sua pasta `dist`) dentro de uma WebView Nativa otimizada, permitindo que o app rode **totalmente offline** e acesse recursos do dispositivo.

---

## 🛠️ Passo 1: Preparação do Ambiente Local

Dado que a compilação de arquivos APK nômades exige utilitários do sistema operacional, você precisará configurar esses pré-requisitos no **seu computador**:

1. **Node.js**: Certifique-se de que o Node.js está instalado (`node -v`).
2. **Android Studio**: Baixe e instale o [Android Studio](https://developer.android.com/studio).
3. **Android SDK**: No Android Studio, vá em *SDK Manager* e instale:
   - A versão mais recente da API Android (e.g., Android 13/14).
   - *Android SDK Command-line Tools*.
   - *Android SDK Build-Tools*.
4. **Variáveis de Ambiente**: Certifique-se de que a variável `ANDROID_HOME` está apontando para o seu diretório do SDK Android.

---

## 📦 Passo 2: Adicionando o Capacitor ao Projeto

No terminal do seu projeto local, execute os seguintes comandos sequenciais para instalar e configurar o ecossistema Capacitor:

1. **Instale o Core e a CLI do Capacitor**:
   ```bash
   npm install @capacitor/core @capacitor/cli
   ```

2. **Inicialize o arquivo de configuração**:
   ```bash
   npx cap init "Lyra Chords" "com.lyrachords.app" --web-dir="dist"
   ```
   *Nota:* 
   - `"Lyra Chords"` é o nome do app visível no celular.
   - `"com.lyrachords.app"` é o ID único do pacote (use seu domínio ou identificador).
   - `--web-dir="dist"` informa ao Capacitor que a pasta de compilação do Vite é a `dist`.

3. **Instale a biblioteca nativa do Android**:
   ```bash
   npm install @capacitor/android
   ```

4. **Adicione a plataforma Android ao seu projeto**:
   ```bash
   npx cap add android
   ```

---

## 🔄 Passo 3: Fluxo de Sincronização & Criação de Build

Sempre que fizer alterações no código React e quiser vê-las no app Android, siga estes três comandos rápidos de atualização:

1. **Gere os arquivos de produção do React**:
   ```bash
   npm run build
   ```
   *Isso cria/atualiza a pasta `dist`.*

2. **Sincronize os arquivos estáticos com o Android nativo**:
   ```bash
   npx cap sync
   ```
   *Isso pega todas as páginas, imagens e estilos de `/dist` e os injeta nos arquivos internos do aplicativo Android.*

3. **Abra o projeto nativo no Android Studio**:
   ```bash
   npx cap open android
   ```
   *Isso inicializa o Android Studio diretamente na pasta nativa criada.*

---

## 🎸 Dicas de Ouro para Músicos (Otimizações do App)

Como o **Lyra Chords** é usado em palcos, ensaios e estudos de longa duração, é altamente recomendável habilitar duas configurações nativas no telefone para que a experiência do instrumentista seja fantástica:

### 💡 1. Evitar que a tela se apague no Palco (Keep Screen On)
Para músicos profissionais, não há nada pior do que a tela apagar no meio de uma música. No ambiente Android, você pode adicionar este comportamento nativo instalando um plugin oficial:

Instale o plugin no terminal:
```bash
npm install @capacitor-community/keep-awake
npx cap sync
```

Em seguida, no seu arquivo de entrada de código (por exemplo, dentro do seu componente `App.tsx` em um `useEffect` de inicialização), importe e ative o plugin:
```typescript
import { KeepAwake } from '@capacitor-community/keep-awake';

// Ative quando o app iniciar
const keepAwake = async () => {
  await KeepAwake.keepAwake();
};
keepAwake();
```

### 📱 2. Configurações de Orientação da Tela
Se você deseja que o app bloqueie na vertical (Portrait) ou acompanhe rotações dinâmicas de tablets fixados em pedestais, controle isso no arquivo `capacitor.config.ts` criado no seu diretório raiz:

```typescript
import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.lyrachords.app',
  appName: 'Lyra Chords',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  },
  plugins: {
    // Caso use recursos de tela adicionais
  }
};

export default config;
```

---

## 🎨 Passo 4: Criando Splash Screen & Ícone do App

Para um visual 100% profissional com visualizador de login e carregamento nativo, use o gerador de recursos automático do Capacitor:

1. Crie uma pasta chamada `assets` no topo do seu projeto.
2. Coloque lá duas imagens:
   - `icon.png` (Mínimo de 1024x1024px)
   - `splash.png` (Mínimo de 2732x2732px)
3. Instale a ferramenta geradora de recursos nativos:
   ```bash
   npm install -g @capacitor/assets
   ```
4. Execute o comando para gerar automaticamente todas as dimensões de ícones e telas de boot do aparelho:
   ```bash
   npx capacitor-assets generate --android
   ```

---

## 🎁 Passo 5: Gerando o APK/AAB e Publicando no Google Play

1. Com o projeto aberto no **Android Studio**:
2. Espere a sincronização do Gradle terminar (aparecerá um check verde).
3. No menu superior, vá em **Build** > **Generate Signed Bundle / APK...**
4. Escolha se prefere gerar:
   - **Android App Bundle (AAB)**: Recomendado e obrigatório pela Google Play Store para subir novos apps.
   - **APK**: Perfeito para mandar direto para amigos instalarem ou testar no cabo.
5. Crie sua chave de assinatura segura (Key Store) preenchendo sua senha de desenvolvedor.
6. Selecione a variante de build **release** e toque em **Finish**.
7. O Android Studio criará o arquivo compilado em minutos. Uma notificação com o botão **Locate** aparecerá no canto inferior direito para você pegar o seu arquivo e carregar no console de desenvolvedor do Google Play!

---

¡Pronto! Você estará com o melhor app de cifras do mundo instalado diretamente no seu celular ou tablet! 🚀
