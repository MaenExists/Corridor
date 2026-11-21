# 09 — Fictional news inbox
Run `make demo` and open News inbox. Two local feeds seed four mock reports, one a possible syndicated copy.
Enter the local key printed in the terminal, verify a non-duplicate fixture, then run `make refresh` and click Reload forecasts.
Verified fixtures get a timestamp and a review-history entry. The cutoff test and browser check showed they are absent before review.
Duplicates can't become separate cues. No live feed or external news service is used.
The verified fixture can appear in forecast evidence; there is no measured predictive lift or automatic retraining.
