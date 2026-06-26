from rest_framework import serializers

from contexts.office.infrastructure.django.models import AvatarProfileModel, DeskModel


class AvatarProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = AvatarProfileModel
        fields = ["skin", "cloth", "hair", "accessory", "configured"]
        read_only_fields = ["configured"]

    def update(self, instance, validated_data):
        for attr, val in validated_data.items():
            setattr(instance, attr, val)
        instance.configured = True
        instance.save()
        return instance


class DeskSerializer(serializers.ModelSerializer):
    owner_name = serializers.SerializerMethodField()

    class Meta:
        model = DeskModel
        fields = ["id", "label", "group_number", "position_in_group",
                  "tile_x", "tile_y", "is_fixed", "owner_name"]

    def get_owner_name(self, obj):
        return obj.owner.full_name if obj.owner else None
