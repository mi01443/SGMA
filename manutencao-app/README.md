# GestManu — Sistema de Gestão de Manutenção Industrial

Sistema web responsivo (mobile + desktop) para gestão de atividades de manutenção.

---

## Estrutura de Arquivos

```
manutencao-app/
├── index.html          ← Página de login
├── app.html            ← App do técnico (atividades, checklist, fotos)
├── admin.html          ← Painel de administração
├── relatorio.html      ← Relatórios + PDF + WhatsApp
├── Code.gs             ← Backend Google Apps Script (copiar para o editor)
└── assets/
    ├── css/
    │   ├── main.css    ← Design system global
    │   ├── app.css     ← Layout app do técnico
    │   └── admin.css   ← Estilos do painel admin
    └── js/
        ├── api.js      ← Comunicação com Apps Script
        ├── auth.js     ← Login e controle de sessão
        ├── utils.js    ← Funções auxiliares
        ├── app.js      ← Lógica do técnico
        ├── admin.js    ← Lógica do admin
        └── relatorio.js← Geração de relatório
```

---

## Configuração — Passo a Passo

### 1. Google Sheets

1. Acesse [sheets.google.com](https://sheets.google.com) e crie uma nova planilha
2. Copie o **ID** da planilha da URL:
   ```
   https://docs.google.com/spreadsheets/d/SEU_ID_AQUI/edit
   ```
3. Não precisa criar abas — o sistema cria automaticamente no primeiro uso

---

### 2. Google Drive

1. Acesse [drive.google.com](https://drive.google.com)
2. Crie uma pasta chamada **"Manutenção"**
3. Abra a pasta e copie o **ID** da URL:
   ```
   https://drive.google.com/drive/folders/SEU_FOLDER_ID_AQUI
   ```

---

### 3. Google Apps Script

1. Abra a planilha do Sheets → menu **Extensões → Apps Script**
2. Apague o código padrão e cole o conteúdo do arquivo `Code.gs`
3. No topo do código, preencha os IDs:
   ```javascript
   const CFG = {
     SHEET_ID:      'ID_DA_SUA_PLANILHA',
     DRIVE_ROOT_ID: 'ID_DA_PASTA_MANUTENCAO',
     TOKEN_SECRET:  'QUALQUER_STRING_ALEATORIA_AQUI',
   };
   ```
4. Clique em **Implantar → Nova implantação**
   - Tipo: **Web App**
   - Executar como: **Eu (sua conta)**
   - Acesso: **Qualquer pessoa**
5. Autorize as permissões solicitadas
6. Copie a **URL** gerada (será algo como `https://script.google.com/macros/s/.../exec`)

---

### 4. Configurar o Frontend

Abra o arquivo `assets/js/api.js` e preencha:

```javascript
const CONFIG = {
  SCRIPT_URL: 'URL_DO_SEU_APPS_SCRIPT',  // ← URL copiada no passo 3
  SHEET_ID:   'ID_DA_SUA_PLANILHA',      // ← mesmo ID do passo 1
  DRIVE_ROOT_ID: 'ID_DA_PASTA',          // ← mesmo ID do passo 2
};
```

---

### 5. Primeiro Usuário Admin

Acesse a planilha Sheets e crie a aba `usuarios` manualmente com a linha de cabeçalho:
```
id | nome | email | usuario | senha_hash | perfil | hh_semana | ativo
```

Para gerar o hash SHA-256 da senha, use este site: [codebeautify.org/sha256-hash-generator](https://codebeautify.org/sha256-hash-generator)

Exemplo de linha (senha = `admin123`):
```
US001 | Admin Sistema | admin@empresa.com | admin | [hash sha256 de admin123] | admin | 44 | true
```

---

### 6. Publicar no GitHub Pages

1. Crie um repositório no GitHub
2. Faça upload de todos os arquivos (exceto `Code.gs`)
3. Vá em **Settings → Pages → Source: main branch**
4. O sistema estará acessível em: `https://seu-usuario.github.io/nome-do-repo`

---

## Perfis de Acesso

| Perfil | Acesso |
|--------|--------|
| `tecnico` | App de atividades, checklist, fotos, histórico |
| `supervisor` | Tudo do técnico + relatórios + importação |
| `admin` | Tudo acima + cadastros + configurações |

---

## Funcionalidades

- ✅ Login com usuário/senha (hash SHA-256)
- ✅ Lista de atividades agrupadas por data
- ✅ Checklist de passos com atualização em tempo real
- ✅ Registro de execução (status, motivo, observação, timer)
- ✅ Upload de fotos antes/depois (salvas no Google Drive)
- ✅ Nova atividade fora de programação / Ver e Agir
- ✅ Painel admin: profissionais, equipamentos, semanas HH
- ✅ Importação de atividades via Excel (.xlsx)
- ✅ Relatório completo com análise de motivos
- ✅ Exportação PDF (via Apps Script)
- ✅ Compartilhamento via WhatsApp (link wa.me)
- ✅ Interface totalmente responsiva (mobile + desktop)
