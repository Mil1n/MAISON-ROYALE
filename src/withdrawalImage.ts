// Eager inline imports keep the supplied image inside the standalone HTML.
// The entry is exposed once the original image has been added to the checkout.
const images=import.meta.glob<string>('./assets/withdrawal-meme.{jpg,jpeg,png,webp}', {
 eager:true,
 query:'?inline',
 import:'default',
});
export const withdrawalImage:string|undefined=Object.values(images)[0];
