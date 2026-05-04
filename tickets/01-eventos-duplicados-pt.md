# Ticket #01 · "Estou vendo eventos de Compra duplicados"

> Mock ticket exchange in pt-BR. The investigation steps reference real endpoints in this repo, so the workflow is reproducible during a screen-share. **English summary:** the advertiser sees ~2× revenue in TikTok Events Manager because their pixel and Events API events have different `event_id` values, so TikTok can't deduplicate them. The fix is to share one `event_id` between both sides.

---

## Inbound (advertiser → support)

> **De:** Mariana (Marketing Tech, Loja Exemplo)
> **Para:** TPS Brasil
> **Assunto:** Eventos de Compra aparecendo duplicados no TikTok

Olá, tudo bem?
Estamos vendo o dobro da receita real no Events Manager da TikTok. Cada compra está sendo contada **duas vezes** — uma pelo Pixel e outra pela Events API. Implementamos o server-side há duas semanas e desde então o ROAS reportado está completamente fora.

Conseguem dar uma olhada? Não queremos pausar a Events API porque sabemos que melhora a atribuição.

Obrigada,
Mariana

---

## Investigação (TPS — interno)

**Hipótese:** os `event_id`s do pixel e do server-side não estão batendo. TikTok deduplica por `event_id` — se forem diferentes, a plataforma trata como dois eventos distintos.

**Passos:**

1. Pedir uma amostra dos últimos 100 eventos enviados via API. Rodar pelo `/audit`:
   ```bash
   curl -X POST -H "Content-Type: application/json" \
     -d @amostra-mariana.json http://localhost:3000/audit
   ```
2. Pegar 5 `event_id`s da resposta e comparar com o que o pixel está disparando no navegador (Inspect → Network → buscar `events.js`).
3. Se forem diferentes formatos (ex: server usa `purchase_ORDER-1001`, pixel usa um UUID gerado por sessão), confirmamos a hipótese.

**Achado provável (baseado em 80% dos tickets parecidos):** o time de dev está gerando o `event_id` server-side a partir do número do pedido (`ORDER-1001`), mas o pixel está usando o `_ttp` de cookie como id — dois universos diferentes.

**Comprovação no nosso tooling:** no `/demo` desse repo dá pra mostrar o padrão correto — o mesmo `event_id` é gerado uma vez no checkout e usado **em ambos os lados**.

---

## Resposta (suporte → advertiser)

> **Para:** Mariana
> **Assunto:** Re: Eventos de Compra aparecendo duplicados no TikTok

Oi Mariana,

Confirmado o problema — a duplicação está acontecendo porque o `event_id` enviado pelo Pixel é diferente do enviado pela Events API. Quando os dois IDs não batem, a TikTok não consegue deduplicar e conta como duas compras.

**A correção é compartilhar o mesmo `event_id` entre os dois lados.** O fluxo é:

1. **Gere o `event_id` no momento do checkout** (no front-end), idealmente a partir do número do pedido. Exemplo: `purchase_ORDER-1001`.
2. **Use esse mesmo valor nos dois lugares:**
   - No pixel: `ttq.track('CompletePayment', { ..., event_id: 'purchase_ORDER-1001' })`
   - Na chamada server-side: campo `event_id` no payload da Events API
3. Validar no Events Manager → aba "Test Events" — você deve ver os eventos chegarem **emparelhados**, não duplicados.

Para acelerar a investigação, se você puder me mandar:
- Um print de uma compra recente no Events Manager (vou conseguir ver os dois `event_id`s lado a lado)
- O snippet exato do disparo do pixel no checkout

Eu consigo te mandar o ajuste exato pro time de dev.

Enquanto isso, **não pause a Events API** — o problema é só a inconsistência do `event_id`, não a integração em si. Pausar vai derrubar a atribuição do iOS 14.5+ que a Events API resolve.

Qualquer coisa, me chama,
[Seu nome] · TPS Brasil

---

## Notas pra mim

- Ticket parecido aparece ~3× por semana em integrações novas
- Padrão pra prevenir: documentar no kickoff que o `event_id` é **uma string compartilhada**, não dois sistemas de id paralelos
- Se a integração for via Shopify, GTM, ou outra plataforma que gera o pixel automaticamente, a correção é diferente — precisa do `dataLayer` carregando o `event_id` antes do pixel disparar
