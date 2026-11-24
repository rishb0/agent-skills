# Official checks

Exact portals, what to record, and what each result does and does not prove. Open this file when you reach the registry, domain, impersonation, and reputation steps in `SKILL.md`.

Use the official domain only. Type it into the address bar or follow a bookmark. Do not reach a government portal through a search ad, a link in an offer, or a third-party "verification" site.

## MCA master data

**Portal:** https://www.mca.gov.in/

**Path:** MCA Services → Master Data → View Company/LLP Master Data. The master data landing page is https://www.mca.gov.in/content/mca/global/en/mca/master-data/MDS.html.

1. Enter the CIN or LLPIN if the company gave one. Otherwise search by name and pick the exact match.
2. Solve the captcha and submit.
3. If the portal asks for a login, do not create an account and do not use the user's credentials. Mark MCA **Unknown** and ask the user to paste the master data.

**Record:**

| Field | Why it matters |
| --- | --- |
| CIN / LLPIN | Ties the record to the exact entity, not a similar name. |
| Company / LLP name | Compare with the offer letter and the website footer. |
| Status (Active, Strike Off, Under Liquidation, Amalgamated) | Struck off or liquidated is a company-profile Tier B signal. |
| Date of incorporation | A very young company with large claims is a context signal, never decisive. |
| Paid-up capital | Very low capital with a young company is a company-profile Tier B signal. |
| Registered address | Compare with the address on the offer and the website. A virtual-office address is a company-profile Tier B signal. |
| Directors / designated partners (DIN) | Registry facts only. No conclusion about any person. |

**Interpretation:**

- **Active** only means the company has not been struck off. It does not prove the company operates, pays interns, or does real work.
- A missing record is a flag only when the company claims to be a Private Limited company or an LLP. Sole proprietorships and partnerships are not registered on MCA.
- Registry problems are company-profile signals. On their own, they never produce a LIKELY SELLING PATTERN verdict; see "Small and new companies" in `SKILL.md`.
- Use the CIN printed on an invoice or offer letter to confirm you opened the right record. Many companies share similar names.
- Do not use a private site that copies MCA data. It can be stale, and some look-alike sites imitate the Ministry.

## GST taxpayer search

**Portal:** https://services.gst.gov.in/services/searchtp

Search by GSTIN/UIN. To find every GSTIN under a PAN, use https://services.gst.gov.in/services/searchtpbypan.

1. Enter the GSTIN from the offer, invoice, or website footer.
2. Solve the captcha and search.
3. Record the legal name, trade name, status, constitution of business, effective date of registration, cancellation date if any, principal place of business, and whether returns are being filed.

**Interpretation:**

- A cancelled or suspended GSTIN is a company-profile Tier B signal.
- The legal name should match the company name on the offer. A different legal name is not automatically bad, but it needs an explanation.
- Only `services.gst.gov.in` is authoritative. A public GSTIN search never needs a password or OTP.

## Udyam verification

**Portal:** https://www.udyamregistration.gov.in/Udyam_Verify.aspx

Use **Print/Verify Udyam Registration** and enter the 19-character URN, which looks like `UDYAM-XX-00-0000000`.

**Record:** enterprise name, type (micro, small, medium), major activity, official address, and registration date.

**Interpretation:**

- Udyam is a self-declaration. It proves the business registered as an MSME, not that it is honest or that it pays interns.
- The certificate carries a dynamic QR code that opens the verification page. A screenshot with no working QR code proves little.
- Registration is free on the official portal. Any site charging for it is not the government portal.

## AICTE internship portal

**Portal:** https://internship.aicte-india.org/

Search the company on the portal itself. A company claim ("listed on AICTE") is unverified marketing until the listing is visible on the portal.

**Interpretation:**

- Registration, applications, shortlisting, and the completion certificate are free for students on the national portal.
- A listing is a counter-signal only when confirmed on the portal.
- If a website, agent, or "placement consultant" asks a student to pay to apply through the national portal, that is not the portal's process.

## Domain age

```bash
whois <domain>
```

Record the **Creation Date**. If the registrar redacts it, try a web-based lookup such as https://lookup.icann.org/. If the creation date is still not shown, mark it **Unknown**.

**Interpretation:** a very new domain is Tier C only. Genuine new startups also have new domains. Never decide a verdict from domain age alone.

## Contact checks

- Check whether staff email addresses use the company's own domain, or a free provider. A free address is Tier C only.
- Check whether the offer was sent from the company's domain, and whether replies go to the same domain.
- Do not call, message, or email the company to test it.

## Impersonation check

Run this when the offer claims to come from a well-known company, or when the branding looks copied.

1. Compare the sender's domain with the official domain of the named company. `company-careers.example` is not `example.com`.
2. Hover or inspect every link and compare the actual host, not the display text.
3. Look for lookalike domains, extra words or hyphens, unusual TLDs, punycode, and swapped characters.
4. Check whether the offer uses a free email address, a form, or a chat account instead of a corporate address.
5. Do not open links from the offer to "verify" it. Type the official domain yourself.

Report any mismatch as an **Impersonation risk** flag. Keep it separate from the selling-pattern verdict: impersonation is a different problem and needs its own warning.

## External reputation queries

Search the company name together with each term:

```text
fees
certificate
review
reddit
linkedin
fake
complaint
refund
```

Prefer independent student accounts with dates and proof. The company's own testimonials, client logos, and placement counts are unverified marketing.

Count a repeated repost of one account once. Three independent students reporting fee or certificate problems is B10.

## Saving evidence

- Save a dated screenshot or PDF of every page you rely on in `companies/<company-slug>/evidence-YYYY-MM-DD-HHMM/`, next to the report. Never save evidence in the skill folder or in git.
- Archive only public pages with https://web.archive.org/. Never submit the user's documents, offer letters, or chats to any archive or online service.
- Quote the exact line you rely on. Paraphrase nothing that matters.
- Record the check date next to every claim. A claim without a source and a date goes under **Unknowns**.

## If the user already paid

Official guidance for financial cyber fraud in India:

- **Helpline:** 1930.
- **Portal:** https://cybercrime.gov.in.
- Report quickly. After a complaint on 1930, the acknowledgement must be completed on the portal within 24 hours.
- Keep the transaction ID, bank or wallet details, receipts, chats, screenshots, and the company's payment page.
- The helpline and portal are for reporting. They do not guarantee a refund.

Verify the helpline number and portal address on an official government source before quoting them. The number above was confirmed on 2026-11-22 from https://cybercrime.gov.in and the Indian Cybercrime Coordination Centre (https://i4c.mha.gov.in/ncrp.aspx). If you are reading this much later, check again.
