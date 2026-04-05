// src/invoiceGenerator.js
// Génération de factures PDF avec pdfmake (polices Helvetica standard, sans fichier externe)
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const fmtEur = (cents) => (cents / 100).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
const fmtDate = (d) => new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
const orderNum = (id) => id.replace(/-/g, '').slice(0, 10).toUpperCase();

/**
 * Génère un buffer PDF pour une commande.
 * @param {Object} order - Données complètes de la commande (issues de la DB)
 * @param {Object[]} items - Articles de la commande
 * @param {Object} siteCfg - Config site (site_name, support_email)
 * @returns {Promise<Buffer>}
 */
export async function generateInvoicePdf(order, items, siteCfg = {}) {
  let PdfPrinter;
  try {
    // pdfmake v0.3.x : le printer Node.js est dans js/Printer, pas dans l'index (bundle browser)
    const mod = require('pdfmake/js/Printer');
    PdfPrinter = mod.default || mod;
  } catch {
    throw new Error('pdfmake non disponible');
  }

  const siteName = siteCfg.site_name || 'XamIoT';
  const supportEmail = siteCfg.support_email || 'support@xamiot.com';

  // Polices standard PDF (aucun fichier externe requis)
  const fonts = {
    Helvetica: {
      normal: 'Helvetica',
      bold: 'Helvetica-Bold',
      italics: 'Helvetica-Oblique',
      bolditalics: 'Helvetica-BoldOblique',
    },
  };

  // pdfmake v0.3.x : urlResolver requis — resolve() enregistre les URLs, resolved() est awaité
  const urlResolver = { resolve: () => {}, resolved: async () => {} };
  const printer = new PdfPrinter(fonts, null, urlResolver);

  // Adresse de livraison
  const shipName = [order.shipping_first_name, order.shipping_last_name].filter(Boolean).join(' ') || order.full_name || '';
  const shipLines = [
    order.shipping_company,
    order.shipping_line1,
    order.shipping_line2,
    [order.shipping_postal_code, order.shipping_city].filter(Boolean).join(' '),
    order.shipping_region,
    order.shipping_country_code,
  ].filter(Boolean);

  // Adresse de facturation
  const billName = order.billing_same_as_shipping ? shipName
    : [order.billing_first_name, order.billing_last_name].filter(Boolean).join(' ') || shipName;
  const billLines = order.billing_same_as_shipping ? shipLines : [
    order.billing_company,
    order.billing_line1,
    order.billing_line2,
    [order.billing_postal_code, order.billing_city].filter(Boolean).join(' '),
    order.billing_region,
    order.billing_country_code,
  ].filter(Boolean);

  // Tableau des articles
  const tableBody = [
    [
      { text: 'Article', style: 'tableHeader' },
      { text: 'Réf.', style: 'tableHeader' },
      { text: 'Qté', style: 'tableHeader', alignment: 'center' },
      { text: 'P.U. HT', style: 'tableHeader', alignment: 'right' },
      { text: 'Total TTC', style: 'tableHeader', alignment: 'right' },
    ],
    ...items.map(item => [
      { text: item.name || item.sku || '—', style: 'tableCell' },
      { text: item.sku || '—', style: 'tableCell', color: '#6b7280' },
      { text: String(item.quantity), style: 'tableCell', alignment: 'center' },
      { text: fmtEur(item.unit_price_cents || 0), style: 'tableCell', alignment: 'right' },
      { text: fmtEur((item.unit_price_cents || 0) * item.quantity), style: 'tableCell', alignment: 'right' },
    ]),
  ];

  // Lignes de totaux
  const totalsRows = [
    [{ text: 'Sous-total', colSpan: 4, alignment: 'right', border: [false, false, false, false] }, {}, {}, {},
     { text: fmtEur(order.subtotal_cents || 0), alignment: 'right', border: [false, false, false, false] }],
  ];
  if (order.shipping_cents > 0) {
    totalsRows.push([
      { text: 'Frais de port', colSpan: 4, alignment: 'right', border: [false, false, false, false] }, {}, {}, {},
      { text: fmtEur(order.shipping_cents), alignment: 'right', border: [false, false, false, false] },
    ]);
  }
  if (order.tax_cents > 0) {
    totalsRows.push([
      { text: 'TVA', colSpan: 4, alignment: 'right', border: [false, false, false, false] }, {}, {}, {},
      { text: fmtEur(order.tax_cents), alignment: 'right', border: [false, false, false, false] },
    ]);
  }
  totalsRows.push([
    { text: 'TOTAL', colSpan: 4, alignment: 'right', bold: true, border: [false, true, false, false] }, {}, {}, {},
    { text: fmtEur(order.total_cents || 0), alignment: 'right', bold: true, border: [false, true, false, false] },
  ]);

  const docDefinition = {
    defaultStyle: { font: 'Helvetica', fontSize: 10, color: '#1f2937' },
    pageMargins: [40, 60, 40, 60],
    styles: {
      header: { fontSize: 22, bold: true, color: '#1d4ed8' },
      label: { fontSize: 8, color: '#6b7280', bold: true },
      sectionTitle: { fontSize: 11, bold: true, margin: [0, 0, 0, 4] },
      tableHeader: { bold: true, fillColor: '#f3f4f6', fontSize: 9 },
      tableCell: { fontSize: 9 },
    },
    content: [
      // En-tête
      {
        columns: [
          { text: siteName, style: 'header', width: '*' },
          {
            width: 'auto',
            stack: [
              { text: 'FACTURE', fontSize: 16, bold: true, color: '#374151', alignment: 'right' },
              { text: `N° ${orderNum(order.id)}`, fontSize: 10, color: '#6b7280', alignment: 'right' },
              { text: `Date : ${fmtDate(order.paid_at || order.created_at)}`, fontSize: 9, color: '#6b7280', alignment: 'right' },
            ],
          },
        ],
        margin: [0, 0, 0, 20],
      },

      // Séparateur
      { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 1, lineColor: '#e5e7eb' }], margin: [0, 0, 0, 16] },

      // Adresses
      {
        columns: [
          {
            width: '50%',
            stack: [
              { text: 'ADRESSE DE LIVRAISON', style: 'label', margin: [0, 0, 0, 4] },
              { text: shipName, bold: true },
              ...shipLines.map(l => ({ text: l })),
            ],
          },
          {
            width: '50%',
            stack: [
              { text: 'ADRESSE DE FACTURATION', style: 'label', margin: [0, 0, 0, 4] },
              { text: billName, bold: true },
              ...billLines.map(l => ({ text: l })),
            ],
          },
        ],
        margin: [0, 0, 0, 20],
      },

      // Informations commande
      {
        columns: [
          { width: 'auto', text: 'Commande : ', color: '#6b7280' },
          { width: '*', text: orderNum(order.id), bold: true },
          { width: 'auto', text: 'Client : ', color: '#6b7280' },
          { width: '*', text: order.email || '', bold: true },
        ],
        margin: [0, 0, 0, 16],
      },

      // Tableau des articles
      {
        table: {
          headerRows: 1,
          widths: ['*', 'auto', 'auto', 'auto', 'auto'],
          body: tableBody,
        },
        layout: {
          hLineWidth: (i, node) => (i === 0 || i === 1 || i === node.table.body.length) ? 1 : 0.5,
          vLineWidth: () => 0,
          hLineColor: (i) => i === 1 ? '#9ca3af' : '#e5e7eb',
          paddingLeft: () => 6,
          paddingRight: () => 6,
          paddingTop: () => 5,
          paddingBottom: () => 5,
        },
        margin: [0, 0, 0, 0],
      },

      // Totaux
      {
        table: {
          widths: ['*', 'auto', 'auto', 'auto', 100],
          body: totalsRows,
        },
        layout: 'noBorders',
        margin: [0, 8, 0, 20],
      },

      // Statut paiement
      {
        text: order.stripe_payment_status === 'succeeded'
          ? '✓ Paiement reçu — Merci pour votre commande !'
          : `Statut : ${order.status}`,
        color: order.stripe_payment_status === 'succeeded' ? '#15803d' : '#92400e',
        bold: true,
        margin: [0, 0, 0, 20],
      },

      // Pied de facture
      { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 0.5, lineColor: '#e5e7eb' }] },
      {
        text: `${siteName} — ${supportEmail}`,
        fontSize: 8, color: '#9ca3af', alignment: 'center', margin: [0, 8, 0, 0],
      },
    ],
  };

  // createPdfKitDocument est async en pdfmake v0.3.x
  const pdfDoc = await printer.createPdfKitDocument(docDefinition);

  return new Promise((resolve, reject) => {
    try {
      const chunks = [];
      pdfDoc.on('data', chunk => chunks.push(chunk));
      pdfDoc.on('end', () => resolve(Buffer.concat(chunks)));
      pdfDoc.on('error', reject);
      pdfDoc.end();
    } catch (e) {
      reject(e);
    }
  });
}
