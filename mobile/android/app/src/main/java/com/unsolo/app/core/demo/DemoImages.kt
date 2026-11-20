package com.unsolo.app.core.demo

import com.unsolo.app.R

object DemoImages {
    /** demo://<name> → drawable resource. Static map so R8 resource shrinking keeps them. */
    val byName: Map<String, Int> = mapOf(
        "ph_himachal" to R.drawable.ph_himachal,
        "ph_spiti" to R.drawable.ph_spiti,
        "ph_kheerganga" to R.drawable.ph_kheerganga,
        "ph_valley" to R.drawable.ph_valley,
        "ph_rishikesh" to R.drawable.ph_rishikesh,
        "ph_tungnath" to R.drawable.ph_tungnath,
        "ph_bhutan" to R.drawable.ph_bhutan,
        "ph_kasol" to R.drawable.ph_kasol,
        "ph_kalga" to R.drawable.ph_kalga,
        "ph_lodhi" to R.drawable.ph_lodhi,
        "ph_brahmatal" to R.drawable.ph_brahmatal,
        "ph_rupin" to R.drawable.ph_rupin,
        "ph_manali" to R.drawable.ph_manali,
        "ph_bike" to R.drawable.ph_bike,
        "ph_camp" to R.drawable.ph_camp,
        "av_rohan" to R.drawable.av_rohan,
        "av_kabir" to R.drawable.av_kabir,
        "av_rahul" to R.drawable.av_rahul,
        "av_subodh" to R.drawable.av_subodh,
        "av_riya" to R.drawable.av_riya,
        "logo_tentit" to R.drawable.logo_tentit,
    )

    fun resolve(url: String?): Int? =
        url?.takeIf { it.startsWith("demo://") }?.removePrefix("demo://")?.let { byName[it] }
}
