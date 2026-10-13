// Identifiant de visite, conservé le temps de l'onglet, envoyé avec chaque événement de mesure.
if (!sessionStorage.getItem('acme_visite')) {
  sessionStorage.setItem('acme_visite', crypto.randomUUID());
}
