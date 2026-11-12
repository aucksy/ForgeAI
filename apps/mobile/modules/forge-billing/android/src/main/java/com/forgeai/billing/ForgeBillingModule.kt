package com.forgeai.billing

import android.content.Context
import android.util.Log
import com.android.billingclient.api.AcknowledgePurchaseParams
import com.android.billingclient.api.BillingClient
import com.android.billingclient.api.BillingClientStateListener
import com.android.billingclient.api.BillingFlowParams
import com.android.billingclient.api.BillingResult
import com.android.billingclient.api.PendingPurchasesParams
import com.android.billingclient.api.ProductDetails
import com.android.billingclient.api.Purchase
import com.android.billingclient.api.PurchasesUpdatedListener
import com.android.billingclient.api.QueryProductDetailsParams
import com.android.billingclient.api.QueryPurchasesParams
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.json.JSONArray
import org.json.JSONObject

/**
 * F56 MettleUp Plus (R-461): Google Play Billing for the member app (JS: src/plan/playBilling.ts).
 * TEST MODE: JS only calls this while MEMBER_PAYMENTS_LIVE is true (@forgeai/theme), which the owner's
 * "payments live" turns on. Nothing secret lives here: Play knows the app by its signature.
 *
 * Products (Play Console): a subscription with two base plans (monthly, yearly) and a one-time, not consumable
 * product for life. Every answer is a plain string so the JS side checks it like any other outside answer.
 *
 * A purchase is ACKNOWLEDGED as soon as Play reports it: Google refunds any purchase left unacknowledged for 3
 * days (VastuFirst lesson). Server-side checking of purchases comes with "payments live".
 */
class ForgeBillingModule : Module() {
  private val ctx: Context?
    get() = appContext.reactContext?.applicationContext

  private var client: BillingClient? = null
  /** The purchase screen waiting for Play's answer (one at a time). */
  private var waiting: Promise? = null
  private var waitingOption: String = ""

  private val listener = PurchasesUpdatedListener { result, purchases ->
    val p = waiting
    waiting = null
    val list = purchases.orEmpty()
    list.forEach { acknowledge(it) }
    val answer = when (result.responseCode) {
      BillingClient.BillingResponseCode.USER_CANCELED -> "cancelled"
      BillingClient.BillingResponseCode.ITEM_ALREADY_OWNED -> "bought"
      BillingClient.BillingResponseCode.OK -> when {
        list.any { it.purchaseState == Purchase.PurchaseState.PURCHASED } -> "bought"
        list.any { it.purchaseState == Purchase.PurchaseState.PENDING } -> "pending"
        else -> "cancelled"
      }
      BillingClient.BillingResponseCode.SERVICE_UNAVAILABLE,
      BillingClient.BillingResponseCode.BILLING_UNAVAILABLE,
      BillingClient.BillingResponseCode.SERVICE_DISCONNECTED -> "unavailable"
      else -> "failed"
    }
    Log.i(TAG, "purchase answer $answer (${result.responseCode}) for $waitingOption")
    p?.resolve(answer)
  }

  private fun billing(c: Context): BillingClient {
    client?.let { return it }
    val b = BillingClient.newBuilder(c)
      .setListener(listener)
      .enablePendingPurchases(PendingPurchasesParams.newBuilder().enableOneTimeProducts().build())
      // Billing 8: reconnects by itself after Play's service drops.
      .enableAutoServiceReconnection()
      .build()
    client = b
    return b
  }

  private fun ready(c: Context, then: (BillingClient?) -> Unit) {
    val b = billing(c)
    if (b.isReady) {
      then(b)
      return
    }
    var done = false
    try {
      b.startConnection(object : BillingClientStateListener {
        override fun onBillingSetupFinished(result: BillingResult) {
          if (done) return
          done = true
          then(if (result.responseCode == BillingClient.BillingResponseCode.OK) b else null)
        }

        override fun onBillingServiceDisconnected() {
          // Not answered here: after a good setup a drop is normal and Billing 8 reconnects by itself.
        }
      })
    } catch (e: Exception) {
      Log.w(TAG, "Google Play not reached", e)
      if (!done) {
        done = true
        then(null)
      }
    }
  }

  private fun acknowledge(p: Purchase) {
    if (p.purchaseState != Purchase.PurchaseState.PURCHASED || p.isAcknowledged) return
    val b = client ?: return
    try {
      b.acknowledgePurchase(AcknowledgePurchaseParams.newBuilder().setPurchaseToken(p.purchaseToken).build()) { r ->
        if (r.responseCode != BillingClient.BillingResponseCode.OK) Log.w(TAG, "purchase not acknowledged: ${r.responseCode}")
      }
    } catch (e: Exception) {
      Log.w(TAG, "purchase not acknowledged", e)
    }
  }

  private fun details(b: BillingClient, sub: String, lifetime: String, then: (List<ProductDetails>) -> Unit) {
    // Subscriptions and one-time products are asked separately (Play refuses a mixed list).
    val subs = QueryProductDetailsParams.newBuilder().setProductList(
      listOf(QueryProductDetailsParams.Product.newBuilder().setProductId(sub).setProductType(BillingClient.ProductType.SUBS).build()),
    ).build()
    val once = QueryProductDetailsParams.newBuilder().setProductList(
      listOf(QueryProductDetailsParams.Product.newBuilder().setProductId(lifetime).setProductType(BillingClient.ProductType.INAPP).build()),
    ).build()
    val found = mutableListOf<ProductDetails>()
    try {
      b.queryProductDetailsAsync(subs) { _, r1 ->
        found.addAll(r1.productDetailsList)
        b.queryProductDetailsAsync(once) { _, r2 ->
          found.addAll(r2.productDetailsList)
          then(found)
        }
      }
    } catch (e: Exception) {
      Log.w(TAG, "products not read", e)
      then(found)
    }
  }

  private fun planOffer(d: ProductDetails, plan: String): ProductDetails.SubscriptionOfferDetails? =
    // The base plan itself (no extra offer): the price the member was shown.
    d.subscriptionOfferDetails?.firstOrNull { it.basePlanId == plan && it.offerId == null }
      ?: d.subscriptionOfferDetails?.firstOrNull { it.basePlanId == plan }

  override fun definition() = ModuleDefinition {
    Name("ForgeBilling")

    // {monthly, yearly, lifetime} -> Play's own price words; "" when Play cannot be reached.
    AsyncFunction("prices") { sub: String, monthlyPlan: String, yearlyPlan: String, lifetime: String, promise: Promise ->
      val c = ctx ?: return@AsyncFunction promise.resolve("")
      ready(c) { b ->
        if (b == null) return@ready promise.resolve("")
        details(b, sub, lifetime) { list ->
          val out = JSONObject()
          list.firstOrNull { it.productId == sub }?.let { d ->
            planOffer(d, monthlyPlan)?.pricingPhases?.pricingPhaseList?.lastOrNull()?.formattedPrice?.let { out.put("monthly", it) }
            planOffer(d, yearlyPlan)?.pricingPhases?.pricingPhaseList?.lastOrNull()?.formattedPrice?.let { out.put("yearly", it) }
          }
          list.firstOrNull { it.productId == lifetime }?.oneTimePurchaseOfferDetails?.formattedPrice?.let { out.put("lifetime", it) }
          promise.resolve(out.toString())
        }
      }
    }

    // Start Play's payment sheet for one option: "bought" | "cancelled" | "pending" | "failed" | "unavailable".
    AsyncFunction("buy") { option: String, sub: String, plan: String, lifetime: String, promise: Promise ->
      val c = ctx ?: return@AsyncFunction promise.resolve("unavailable")
      if (waiting != null) return@AsyncFunction promise.resolve("failed")
      ready(c) { b ->
        if (b == null) return@ready promise.resolve("unavailable")
        details(b, sub, lifetime) { list ->
          val activity = appContext.currentActivity ?: return@details promise.resolve("failed")
          val params = if (option == "lifetime") {
            val d = list.firstOrNull { it.productId == lifetime } ?: return@details promise.resolve("unavailable")
            BillingFlowParams.ProductDetailsParams.newBuilder().setProductDetails(d).build()
          } else {
            val d = list.firstOrNull { it.productId == sub } ?: return@details promise.resolve("unavailable")
            val offer = planOffer(d, plan) ?: return@details promise.resolve("unavailable")
            BillingFlowParams.ProductDetailsParams.newBuilder().setProductDetails(d).setOfferToken(offer.offerToken).build()
          }
          waiting = promise
          waitingOption = option
          activity.runOnUiThread {
            try {
              val r = b.launchBillingFlow(activity, BillingFlowParams.newBuilder().setProductDetailsParamsList(listOf(params)).build())
              if (r.responseCode != BillingClient.BillingResponseCode.OK) {
                waiting = null
                promise.resolve(if (r.responseCode == BillingClient.BillingResponseCode.ITEM_ALREADY_OWNED) "bought" else "failed")
              }
            } catch (e: Exception) {
              Log.w(TAG, "payment sheet not opened", e)
              waiting = null
              promise.resolve("failed")
            }
          }
        }
      }
    }

    // What this Google account owns now: JSON ["lifetime"] / ["subscription"] / []; "" when Play cannot be asked.
    // (Which base plan a subscription is on is not in a Purchase; the app keeps the option it bought.)
    AsyncFunction("owned") { sub: String, _monthlyPlan: String, _yearlyPlan: String, lifetime: String, promise: Promise ->
      val c = ctx ?: return@AsyncFunction promise.resolve("")
      ready(c) { b ->
        if (b == null) return@ready promise.resolve("")
        val out = JSONArray()
        try {
          b.queryPurchasesAsync(QueryPurchasesParams.newBuilder().setProductType(BillingClient.ProductType.SUBS).build()) { r1, subs ->
            if (r1.responseCode != BillingClient.BillingResponseCode.OK) return@queryPurchasesAsync promise.resolve("")
            val mine = subs.filter { it.purchaseState == Purchase.PurchaseState.PURCHASED && it.products.contains(sub) }
            mine.forEach { acknowledge(it) }
            if (mine.isNotEmpty()) out.put("subscription")
            b.queryPurchasesAsync(QueryPurchasesParams.newBuilder().setProductType(BillingClient.ProductType.INAPP).build()) { r2, once ->
              if (r2.responseCode != BillingClient.BillingResponseCode.OK) return@queryPurchasesAsync promise.resolve("")
              once.filter { it.purchaseState == Purchase.PurchaseState.PURCHASED && it.products.contains(lifetime) }.forEach {
                acknowledge(it)
                out.put("lifetime")
              }
              promise.resolve(out.toString())
            }
          }
        } catch (e: Exception) {
          Log.w(TAG, "purchases not read", e)
          promise.resolve("")
        }
      }
    }
  }

  companion object {
    private const val TAG = "ForgeBilling"
  }
}
