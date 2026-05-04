import { Phone, MapPin, MessageCircle, Leaf } from "lucide-react";

export function Footer() {
  return (
    <footer id="contact" className="bg-foreground text-background">
      <div className="mx-auto max-w-6xl px-4 md:px-8 py-16 md:py-20">
        <div className="grid md:grid-cols-3 gap-10">
          <div>
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <Leaf className="h-5 w-5" />
              </span>
              <div>
                <div className="font-display text-lg font-semibold">Rose Hill Cottage</div>
                <div className="font-malayalam text-sm opacity-70">റോസ് ഹിൽ കോട്ടേജ്</div>
              </div>
            </div>
            <p className="mt-5 text-sm opacity-70 leading-relaxed">
              An organic farm stay nestled in the misty hills of Vattavada, Kerala.
            </p>
          </div>

          <div>
            <h3 className="font-display text-lg font-semibold mb-4">Visit us</h3>
            <a
              href="https://maps.google.com/?q=Upper+Vattavada+Munnar"
              target="_blank"
              rel="noreferrer"
              className="flex items-start gap-3 text-sm opacity-80 hover:opacity-100"
            >
              <MapPin className="h-5 w-5 mt-0.5 text-primary shrink-0" />
              <span>
                Upper Vattavada
                <br />
                Munnar Road, Kerala
              </span>
            </a>
          </div>

          <div>
            <h3 className="font-display text-lg font-semibold mb-4">Get in touch</h3>
            <div className="space-y-3">
              <a
                href="tel:+919999999999"
                className="flex items-center gap-3 rounded-full bg-background/10 hover:bg-background/15 px-5 py-3 text-sm font-medium transition-colors"
              >
                <Phone className="h-4 w-4" />
                Call host
              </a>
              <a
                href="https://wa.me/919999999999"
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-3 rounded-full bg-whatsapp text-primary-foreground hover:opacity-90 px-5 py-3 text-sm font-medium transition-opacity"
              >
                <MessageCircle className="h-4 w-4" />
                WhatsApp
              </a>
            </div>
          </div>
        </div>

        <div className="mt-12 border-t border-background/10 pt-6 flex flex-col md:flex-row items-center justify-between gap-3 text-xs opacity-60">
          <span>© {new Date().getFullYear()} Rose Hill Cottage. All rights reserved.</span>
          <span>Hosted by Raju Thomas</span>
        </div>
      </div>
    </footer>
  );
}
